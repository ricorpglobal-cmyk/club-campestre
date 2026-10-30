import { z } from 'zod';
import { PoolClient } from 'pg';
import { q, one, tx, pool } from '../db';
import { audit, AuditUser } from '../audit';
import { badRequest, conflict, notFound } from '../errors';
import { getConfig, nextFolio } from '../config';
import { toCents, fromCents } from '../money';
import { isISODate, todayISO } from '../dates';
import { allocate, recomputeContract, toItem } from './ledger';
import { syncLotStatus } from './lots';

export const CONCEPTS = ['APARTADO', 'ENGANCHE', 'MENSUAL', 'EXTRAORDINARIO', 'MORATORIO', 'LIQUIDACION', 'AJUSTE'] as const;
export const CONCEPT_LABEL: Record<string, string> = {
  APARTADO: 'Apartado', ENGANCHE: 'Enganche', MENSUAL: 'Aportación mensual', EXTRAORDINARIO: 'Abono extraordinario',
  MORATORIO: 'Interés moratorio', LIQUIDACION: 'Liquidación', AJUSTE: 'Ajuste autorizado',
};
export const METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'OTRO'] as const;
export const METHOD_LABEL: Record<string, string> = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia bancaria', DEPOSITO: 'Depósito', CHEQUE: 'Cheque', OTRO: 'Otro' };

const money = z.union([z.number(), z.string()]).transform((v) => toCents(v)).refine((v) => v >= 0, 'No se permiten importes negativos');
export const paymentSchema = z.object({
  contract_id: z.coerce.number().int().positive(),
  effective_date: z.string().refine(isISODate, 'Fecha efectiva inválida'),
  concept: z.enum(CONCEPTS),
  capital: money.optional().default(0),
  interest: money.optional().default(0),
  method: z.enum(METHODS),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  scheduled_number: z.coerce.number().int().min(0).optional().nullable(),
  idempotency_key: z.string().trim().min(8).max(100).optional().nullable(),
  confirm_duplicate: z.boolean().optional(),
  receipt_number: z.string().trim().max(40).optional().nullable(),
});
export type PaymentInput = z.input<typeof paymentSchema>;

async function validate(c: PoolClient | ReturnType<typeof pool>, d: z.output<typeof paymentSchema>, opts: { allowFuture?: boolean; allowCancelled?: boolean } = {}) {
  const cfg = await getConfig(c);
  const k = await one<any>('SELECT * FROM contracts WHERE id=$1', [d.contract_id], c);
  if (!k) throw notFound('El contrato no existe.');
  if (k.status === 'CANCELADO' && !opts.allowCancelled) throw conflict('No se pueden registrar aportaciones en un contrato cancelado.');
  const today = todayISO(cfg.zona_horaria);
  if (!opts.allowFuture && d.effective_date > today) throw badRequest('La fecha efectiva no puede ser posterior a hoy: una aportación programada no se registra como recibida.');
  if (d.effective_date < '2000-01-01') throw badRequest('Fecha efectiva fuera de rango.');
  if (d.concept === 'MORATORIO') {
    if (d.capital > 0) throw badRequest('El interés moratorio se captura en el campo de interés, sin capital.');
    if (d.interest <= 0) throw badRequest('Capture el importe del interés.');
  } else if (d.capital <= 0) throw badRequest('El importe de capital debe ser mayor a cero.');
  const paid = await one<{ s: string }>(`SELECT coalesce(sum(capital),0) s FROM payments WHERE contract_id=$1 AND status='CONFIRMADA'`, [d.contract_id], c);
  const pending = toCents(k.price_agreed) - toCents(paid!.s);
  if (d.capital > pending) throw badRequest(`El capital (${fromCents(d.capital)}) excede el saldo pendiente del contrato (${fromCents(pending)}).`);
  const warnings: string[] = [];
  if (d.effective_date < k.contract_date) warnings.push('La fecha efectiva es anterior a la fecha del contrato.');
  if (d.concept === 'LIQUIDACION' && d.capital !== pending) warnings.push('El concepto es "Liquidación" pero el importe no cubre todo el saldo pendiente.');
  return { k, pending, warnings, today };
}

/** Simula la distribución sin guardar nada (vista previa para el usuario). */
export async function previewPayment(input: PaymentInput) {
  const d = paymentSchema.parse(input);
  const { k, pending, warnings, today } = await validate(pool(), d);
  const items = (await q<any>('SELECT * FROM schedule_items WHERE contract_id=$1', [k.id])).map(toItem);
  const paidRows = await q<any>(`SELECT pa.schedule_item_id, sum(pa.amount) s FROM payment_applications pa JOIN payments p ON p.id=pa.payment_id WHERE p.contract_id=$1 AND p.status='CONFIRMADA' GROUP BY 1`, [k.id]);
  const already = new Map(paidRows.map((r) => [r.schedule_item_id, toCents(r.s)]));
  const { apps } = allocate(items, [{ id: 0, concept: d.concept, capital: d.capital, effective_date: d.effective_date }], already);
  const dup = await findDuplicate(d);
  if (dup) warnings.push(`Posible duplicado: ya existe el recibo ${dup.receipt_number} del ${dup.effective_date} por el mismo importe.`);
  return {
    pending_before: fromCents(pending), pending_after: fromCents(pending - d.capital), warnings, duplicate: !!dup,
    distribution: apps.map((a) => {
      const it = items.find((i) => i.id === a.item_id)!;
      return { kind: it.kind, number: it.number, due_date: it.due_date, amount: fromCents(a.amount), advance: it.due_date > today };
    }),
  };
}

async function findDuplicate(d: z.output<typeof paymentSchema>, c: any = pool()) {
  return one<any>(`SELECT receipt_number, effective_date FROM payments WHERE contract_id=$1 AND effective_date=$2 AND capital=$3 AND interest=$4 AND status='CONFIRMADA'
    AND ($5::text IS NULL OR coalesce(reference,'') = $5) LIMIT 1`, [d.contract_id, d.effective_date, fromCents(d.capital), fromCents(d.interest), d.reference || null], c);
}

export async function registerPayment(input: PaymentInput, user: AuditUser, ip: string | null, opts: { db?: PoolClient; source?: 'CAPTURA' | 'IMPORTACION'; skipDuplicateCheck?: boolean; deferRecompute?: boolean } = {}) {
  const d = paymentSchema.parse(input);
  const run = async (c: PoolClient) => {
    // Reintento por error de conexión: la misma clave devuelve el mismo registro, sin duplicar
    if (d.idempotency_key) {
      const prev = await one<any>('SELECT * FROM payments WHERE idempotency_key=$1', [d.idempotency_key], c);
      if (prev) return { payment: prev, replay: true, distribution: [] as any[] };
    }
    await q('SELECT id FROM contracts WHERE id=$1 FOR UPDATE', [d.contract_id], c);    // serializa pagos del mismo contrato
    const { k, warnings } = await validate(c, d, { allowCancelled: opts.source === 'IMPORTACION' });
    if (!opts.skipDuplicateCheck && !d.confirm_duplicate) {
      const dup = await findDuplicate(d, c);
      if (dup) throw conflict(`Posible duplicado: ya existe el recibo ${dup.receipt_number} del mismo día por el mismo importe. Confirme si desea registrarlo de todos modos.`, { duplicate: true });
    }
    const cfg = await getConfig(c);
    const receipt = d.receipt_number?.trim() || await nextFolio(c, 'recibo', cfg.prefijo_recibo, Number(d.effective_date.slice(0, 4)), 5);
    const p = await one<any>(`INSERT INTO payments(receipt_number, idempotency_key, contract_id, effective_date, concept, scheduled_number, capital, interest, method, reference, notes, source, user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [receipt, d.idempotency_key ?? null, d.contract_id, d.effective_date, d.concept, d.scheduled_number ?? null, fromCents(d.capital), fromCents(d.interest),
       d.method, d.reference ?? null, d.notes ?? null, opts.source ?? 'CAPTURA', user?.id ?? null], c);
    if (opts.deferRecompute) {
      await audit(c, user, 'IMPORTACION_APORTACION', { entity: 'aportacion', entityId: p.id, ip, after: { recibo: receipt, contrato: k.contract_number, fecha: d.effective_date, concepto: d.concept, capital: fromCents(d.capital), interes: fromCents(d.interest) } });
      return { payment: p, replay: false, distribution: [] as any[], warnings };
    }
    const { apps } = await recomputeContract(c, d.contract_id);
    await syncLotStatus(c, k.lot_id);
    const mine = apps.filter((a) => a.payment_id === p.id);
    const items = await q<any>('SELECT id, kind, number, due_date FROM schedule_items WHERE id = ANY($1)', [mine.map((a) => a.item_id)], c);
    const distribution = mine.map((a) => { const it = items.find((i) => i.id === a.item_id); return { kind: it.kind, number: it.number, due_date: it.due_date, amount: fromCents(a.amount) }; });
    await audit(c, user, opts.source === 'IMPORTACION' ? 'IMPORTACION_APORTACION' : 'REGISTRO_APORTACION', {
      entity: 'aportacion', entityId: p.id, ip,
      after: { recibo: receipt, contrato: k.contract_number, fecha: d.effective_date, concepto: d.concept, capital: fromCents(d.capital), interes: fromCents(d.interest), forma: d.method, distribucion: distribution } });
    return { payment: p, replay: false, distribution, warnings };
  };
  if (opts.db) return run(opts.db);
  try { return await tx(run); }
  catch (e: any) {
    // carrera entre dos reintentos simultáneos con la misma clave
    if (e?.code === '23505' && String(e.constraint).includes('idempotency') && d.idempotency_key) {
      const prev = await one<any>('SELECT * FROM payments WHERE idempotency_key=$1', [d.idempotency_key]);
      if (prev) return { payment: prev, replay: true, distribution: [] };
    }
    throw e;
  }
}

export async function cancelPayment(id: number, reason: string, user: AuditUser, ip: string | null) {
  if (!reason?.trim() || reason.trim().length < 5) throw badRequest('Indique el motivo de la cancelación (mínimo 5 caracteres).');
  return tx(async (c) => {
    const p = await one<any>('SELECT * FROM payments WHERE id=$1', [id], c);
    if (!p) throw notFound('Aportación no encontrada.');
    await q('SELECT id FROM contracts WHERE id=$1 FOR UPDATE', [p.contract_id], c);
    if (p.status === 'CANCELADA') throw conflict('La aportación ya estaba cancelada.');
    await q(`UPDATE payments SET status='CANCELADA' WHERE id=$1`, [id], c);
    await q('INSERT INTO payment_reversals(payment_id, reason, user_id) VALUES ($1,$2,$3)', [id, reason.trim(), user!.id], c);
    await recomputeContract(c, p.contract_id);
    const k = await one<any>('SELECT lot_id FROM contracts WHERE id=$1', [p.contract_id], c);
    await syncLotStatus(c, k.lot_id);
    await audit(c, user, 'CANCELACION_APORTACION', { entity: 'aportacion', entityId: id, reason, ip,
      before: { status: 'CONFIRMADA', recibo: p.receipt_number, total: p.total }, after: { status: 'CANCELADA' } });
  });
}

export async function listPayments(f: { from?: string; to?: string; contract_id?: number; client_id?: number; method?: string; concept?: string; status?: string; user_id?: number; q?: string; limit?: number } = {}) {
  const w: string[] = []; const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', `$${p.length}`)); };
  if (f.from) add('p.effective_date >= ?', f.from);
  if (f.to) add('p.effective_date <= ?', f.to);
  if (f.contract_id) add('p.contract_id = ?', f.contract_id);
  if (f.client_id) add('k.client_id = ?', f.client_id);
  if (f.method) add('p.method = ?', f.method);
  if (f.concept) add('p.concept = ?', f.concept);
  if (f.status) add('p.status = ?', f.status);
  if (f.user_id) add('p.user_id = ?', f.user_id);
  if (f.q) add(`(lower(p.receipt_number) LIKE ? OR lower(cl.full_name) LIKE $${p.length} OR lower(k.contract_number) LIKE $${p.length} OR lower(coalesce(p.reference,'')) LIKE $${p.length})`, `%${f.q.toLowerCase()}%`);
  p.push(f.limit ?? 2000);
  return q<any>(`SELECT p.*, k.contract_number, k.client_id, cl.full_name client_name, l.lot_key, u.username, r.reason cancel_reason, r.created_at cancelled_at, ru.username cancelled_by
    FROM payments p JOIN contracts k ON k.id=p.contract_id JOIN clients cl ON cl.id=k.client_id JOIN lots l ON l.id=k.lot_id
    LEFT JOIN users u ON u.id=p.user_id LEFT JOIN payment_reversals r ON r.payment_id=p.id LEFT JOIN users ru ON ru.id=r.user_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.effective_date DESC, p.id DESC LIMIT $${p.length}`, p);
}

export async function getPayment(id: number) {
  const r = await one<any>(`SELECT p.*, k.contract_number, k.price_agreed, k.plan, cl.full_name client_name, cl.code client_code, l.lot_key, u.username, u.full_name user_full_name
    FROM payments p JOIN contracts k ON k.id=p.contract_id JOIN clients cl ON cl.id=k.client_id JOIN lots l ON l.id=k.lot_id LEFT JOIN users u ON u.id=p.user_id WHERE p.id=$1`, [id]);
  if (!r) throw notFound('Aportación no encontrada.');
  const apps = await q<any>(`SELECT si.kind, si.number, si.due_date, pa.amount FROM payment_applications pa JOIN schedule_items si ON si.id=pa.schedule_item_id WHERE pa.payment_id=$1 ORDER BY si.kind, si.number`, [id]);
  return { payment: r, apps };
}
