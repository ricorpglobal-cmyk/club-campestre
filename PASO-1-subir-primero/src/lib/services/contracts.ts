import { z } from 'zod';
import { PoolClient } from 'pg';
import { q, one, tx, Db, pool } from '../db';
import { audit, AuditUser } from '../audit';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { getConfig, nextFolio, SystemConfig } from '../config';
import { toCents, fromCents, splitEven } from '../money';
import { addMonthsOnDay, isISODate, todayISO } from '../dates';
import { syncLotStatus } from './lots';
import { contractState, collectionStatus, recomputeContract, accruedMoratorium } from './ledger';

export const PLAN_LABEL: Record<string, string> = { CONTADO: 'Contado', '36': '36 meses', '48': '48 meses', OTRO: 'Plan especial' };
export const CONTRACT_STATUS_LABEL: Record<string, string> = { ACTIVO: 'Activo', LIQUIDADO: 'Liquidado', CANCELADO: 'Cancelado', EN_REVISION: 'En revisión' };

const money = z.union([z.number(), z.string()]).transform((v) => toCents(v)).refine((v) => v >= 0, 'No se permiten importes negativos');
export const contractInputSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  lot_id: z.coerce.number().int().positive(),
  plan: z.enum(['CONTADO', '36', '48', 'OTRO']),
  contract_date: z.string().refine(isISODate, 'Fecha de contrato inválida'),
  apartado: money.optional().default(0),
  apartado_mode: z.enum(['PRECIO', 'ENGANCHE']).optional(),
  first_due_date: z.string().refine(isISODate, 'Fecha de primera aportación inválida').optional().nullable(),
  pay_day: z.coerce.number().int().min(1).max(31).optional().nullable(),
  responsible_user_id: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // condiciones especiales (excepción autorizada)
  exception: z.object({
    price_agreed: money.optional(), enganche: money.optional(), n_installments: z.coerce.number().int().min(0).max(240).optional(), reason: z.string().trim().min(5, 'Indique el motivo de la excepción'),
  }).optional().nullable(),
  contract_number: z.string().trim().max(40).optional().nullable(),
});
export type ContractInput = z.input<typeof contractInputSchema>;

type Terms = {
  price: number; enganche: number; apartado: number; mode: 'PRECIO' | 'ENGANCHE'; n: number; financed: number;
  parts: number[]; first_due: string | null; pay_day: number | null; schedule: { kind: string; number: number; due_date: string; amount: number }[];
  list: any; is_exception: boolean; est_end: string | null;
};

/** Calcula condiciones y calendario. Fuente: lista vigente del terreno, salvo excepción autorizada. */
export function computeTerms(lot: any, d: z.output<typeof contractInputSchema>, cfg: SystemConfig): Terms {
  const list = d.plan === '36' ? { price: lot.price_36, down: lot.down_36, monthly: lot.monthly_36, n: 36 }
    : d.plan === '48' ? { price: lot.price_48, down: lot.down_48, monthly: lot.monthly_48, n: 48 }
    : d.plan === 'CONTADO' ? { price: lot.price_cash, down: 0, monthly: null, n: 1 } : { price: null, down: null, monthly: null, n: null };
  const ex = d.exception;
  if (d.plan === 'OTRO' && !ex) throw badRequest('El plan especial requiere capturar condiciones como excepción autorizada.');
  if (list.price === null && !ex?.price_agreed) throw badRequest(`El terreno no tiene precio para el plan ${PLAN_LABEL[d.plan]} en la lista vigente.`);
  const price = ex?.price_agreed ?? toCents(list.price);
  const enganche = ex?.enganche ?? toCents(list.down ?? 0);
  const n = ex?.n_installments ?? (list.n as number);
  const mode = d.apartado_mode ?? cfg.modo_apartado;
  const apartado = d.apartado ?? 0;
  const is_exception = !!ex && (price !== toCents(list.price) || enganche !== toCents(list.down ?? 0) || n !== list.n);
  if (price <= 0) throw badRequest('El precio pactado debe ser mayor a cero.');
  if (mode === 'ENGANCHE' && apartado > enganche) throw badRequest('El apartado no puede ser mayor que el enganche cuando se aplica al enganche.');
  const financed = price - enganche - (mode === 'PRECIO' ? apartado : 0);
  if (financed < 0) throw badRequest('Apartado y enganche superan el precio pactado.');
  if (financed > 0 && n <= 0) throw badRequest('Debe haber al menos una aportación para el saldo financiado.');
  const pay_day = d.pay_day ?? (d.first_due_date ? Number(d.first_due_date.slice(8, 10)) : Number(d.contract_date.slice(8, 10)));
  const first_due = financed > 0 ? (d.first_due_date ?? (d.plan === 'CONTADO' ? d.contract_date : addMonthsOnDay(d.contract_date, 1, pay_day))) : null;
  if (first_due && first_due < d.contract_date) throw badRequest('La primera aportación no puede ser anterior a la fecha del contrato.');
  const parts = financed > 0 ? splitEven(financed, n) : [];
  const schedule: Terms['schedule'] = [];
  if (mode === 'PRECIO' && apartado > 0) schedule.push({ kind: 'APARTADO', number: 0, due_date: d.contract_date, amount: apartado });
  if (enganche > 0) schedule.push({ kind: 'ENGANCHE', number: 0, due_date: d.contract_date, amount: enganche });
  parts.forEach((a, i) => schedule.push({ kind: 'MENSUAL', number: i + 1, due_date: addMonthsOnDay(first_due!, i, pay_day), amount: a }));
  const total = schedule.reduce((s, x) => s + x.amount, 0);
  if (total !== price) throw new Error(`Calendario inconsistente: ${total} vs ${price}`);
  return { price, enganche, apartado, mode, n: parts.length, financed, parts, first_due, pay_day: financed > 0 ? pay_day : null, schedule,
    list: { plan: d.plan, ...Object.fromEntries(Object.entries(list).map(([k, v]) => [k, v === null ? null : String(v)])), lot_key: lot.lot_key, captured_at: new Date().toISOString(),
      price_cash: lot.price_cash, price_36: lot.price_36, down_36: lot.down_36, monthly_36: lot.monthly_36, price_48: lot.price_48, down_48: lot.down_48, monthly_48: lot.monthly_48 },
    is_exception, est_end: schedule.length ? schedule[schedule.length - 1].due_date : null };
}

export async function previewContract(input: ContractInput) {
  const d = contractInputSchema.parse(input);
  const cfg = await getConfig();
  const lot = await one<any>('SELECT * FROM lots WHERE id=$1', [d.lot_id]);
  if (!lot) throw notFound('Terreno no encontrado.');
  const t = computeTerms(lot, d, cfg);
  return { ...publicTerms(t), lot_status: lot.status };
}
const publicTerms = (t: Terms) => ({
  price: fromCents(t.price), enganche: fromCents(t.enganche), apartado: fromCents(t.apartado), apartado_mode: t.mode, financed: fromCents(t.financed),
  n_installments: t.n, installment_amount: fromCents(t.parts[0] ?? 0), last_installment: fromCents(t.parts[t.parts.length - 1] ?? 0),
  first_due_date: t.first_due, pay_day: t.pay_day, est_end_date: t.est_end, is_exception: t.is_exception,
  schedule: t.schedule.map((s) => ({ ...s, amount: fromCents(s.amount) })),
});

export async function createContract(input: ContractInput, user: AuditUser & { perms?: Set<string> }, ip: string | null,
  opts: { db?: PoolClient; source?: 'CAPTURA' | 'IMPORTACION'; status?: string; allowAnyLotStatus?: boolean } = {}) {
  const d = contractInputSchema.parse(input);
  const run = async (c: PoolClient) => {
    const cfg = await getConfig(c);
    const lot = await one<any>('SELECT * FROM lots WHERE id=$1 FOR UPDATE', [d.lot_id], c);
    if (!lot) throw notFound('Terreno no encontrado.');
    if (!opts.allowAnyLotStatus && !['DISPONIBLE', 'APARTADO'].includes(lot.status)) throw conflict(`El terreno ${lot.lot_key} no está disponible (estatus: ${lot.status}).`);
    const active = await one<any>(`SELECT contract_number FROM contracts WHERE lot_id=$1 AND status <> 'CANCELADO'`, [d.lot_id], c);
    if (active) throw conflict(`El terreno ${lot.lot_key} ya tiene el contrato vigente ${active.contract_number}.`);
    const client = await one<any>('SELECT id, full_name FROM clients WHERE id=$1', [d.client_id], c);
    if (!client) throw notFound('Cliente no encontrado.');
    const t = computeTerms(lot, d, cfg);
    if (t.is_exception) {
      if (!cfg.permitir_excepciones) throw forbidden('Las condiciones especiales están deshabilitadas en la configuración.');
      if (opts.source !== 'IMPORTACION' && !user?.perms?.has('contratos.excepcion')) throw forbidden('Las condiciones especiales requieren autorización de un usuario con permiso de excepciones.');
    }
    const number = d.contract_number?.trim() || await nextFolio(c, 'contrato', cfg.prefijo_contrato, Number(d.contract_date.slice(0, 4)));
    const status = opts.status ?? 'ACTIVO';
    const k = await one<any>(`INSERT INTO contracts(contract_number, contract_date, client_id, lot_id, plan, price_agreed, apartado, apartado_mode, enganche, financed,
        n_installments, installment_amount, first_due_date, pay_day, est_end_date, list_snapshot, is_exception, exception_reason, exception_authorized_by,
        responsible_user_id, status, notes, source, created_by, cancel_reason, cancelled_at, cancelled_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *`,
      [number, d.contract_date, d.client_id, d.lot_id, d.plan, fromCents(t.price), fromCents(t.apartado), t.mode, fromCents(t.enganche), fromCents(t.financed),
       t.n, fromCents(t.parts[0] ?? 0), t.first_due, t.pay_day, t.est_end, JSON.stringify(t.list), t.is_exception,
       t.is_exception ? d.exception!.reason : null, t.is_exception ? user?.id ?? null : null,
       d.responsible_user_id ?? user?.id ?? null, status, d.notes ?? null, opts.source ?? 'CAPTURA', user?.id ?? null,
       status === 'CANCELADO' ? 'Cancelado (importado)' : null, status === 'CANCELADO' ? new Date() : null, status === 'CANCELADO' ? user?.id ?? null : null], c);
    for (const s of t.schedule) {
      await q('INSERT INTO schedule_items(contract_id, kind, number, due_date, amount, status_override) VALUES ($1,$2,$3,$4,$5,$6)',
        [k.id, s.kind, s.number, s.due_date, fromCents(s.amount), status === 'CANCELADO' ? 'CANCELADA' : null], c);
    }
    await syncLotStatus(c, d.lot_id);
    await audit(c, user, opts.source === 'IMPORTACION' ? 'IMPORTACION_CONTRATO' : 'ALTA_CONTRATO', {
      entity: 'contrato', entityId: k.id, ip, reason: t.is_exception ? d.exception!.reason : null,
      after: { contract_number: number, lote: lot.lot_key, cliente: client.full_name, plan: d.plan, precio: fromCents(t.price), enganche: fromCents(t.enganche), apartado: fromCents(t.apartado), aportaciones: t.n, excepcion: t.is_exception } });
    return k;
  };
  return opts.db ? run(opts.db) : tx(run);
}

export async function cancelContract(id: number, reason: string, user: AuditUser, ip: string | null) {
  if (!reason?.trim() || reason.trim().length < 5) throw badRequest('Indique el motivo de la cancelación.');
  return tx(async (c) => {
    const k = await one<any>('SELECT * FROM contracts WHERE id=$1 FOR UPDATE', [id], c);
    if (!k) throw notFound('Contrato no encontrado.');
    if (k.status === 'CANCELADO') throw conflict('El contrato ya está cancelado.');
    await q(`UPDATE contracts SET status='CANCELADO', cancel_reason=$2, cancelled_at=now(), cancelled_by=$3, updated_at=now() WHERE id=$1`, [id, reason.trim(), user?.id], c);
    // Las obligaciones sin pagar se marcan canceladas; lo ya pagado se conserva en el historial
    await q(`UPDATE schedule_items si SET status_override='CANCELADA' WHERE contract_id=$1 AND amount > coalesce((SELECT sum(pa.amount) FROM payment_applications pa JOIN payments p ON p.id=pa.payment_id WHERE pa.schedule_item_id=si.id AND p.status='CONFIRMADA'),0)`, [id], c);
    const lotStatus = await syncLotStatus(c, k.lot_id);
    await audit(c, user, 'CANCELACION_CONTRATO', { entity: 'contrato', entityId: id, before: { status: k.status }, after: { status: 'CANCELADO', terreno: lotStatus }, reason, ip });
  });
}

export async function updateContractMeta(id: number, data: { notes?: string | null; responsible_user_id?: number | null; en_revision?: boolean }, user: AuditUser, ip: string | null) {
  return tx(async (c) => {
    const k = await one<any>('SELECT * FROM contracts WHERE id=$1 FOR UPDATE', [id], c);
    if (!k) throw notFound('Contrato no encontrado.');
    if (k.status === 'CANCELADO') throw conflict('Un contrato cancelado no se modifica.');
    let status = k.status;
    if (data.en_revision === true && k.status === 'ACTIVO') status = 'EN_REVISION';
    if (data.en_revision === false && k.status === 'EN_REVISION') status = 'ACTIVO';
    await q('UPDATE contracts SET notes=$2, responsible_user_id=$3, status=$4, updated_at=now() WHERE id=$1', [id, data.notes ?? k.notes, data.responsible_user_id ?? k.responsible_user_id, status], c);
    if (status !== k.status) await recomputeContract(c, id);
    await audit(c, user, 'MODIFICACION_CONTRATO', { entity: 'contrato', entityId: id, before: { notes: k.notes, responsible_user_id: k.responsible_user_id, status: k.status }, after: { ...data, status }, ip });
  });
}

export async function listContracts(f: { q?: string; status?: string; client_id?: number; from?: string; to?: string } = {}) {
  const w: string[] = []; const p: unknown[] = [];
  if (f.q) { p.push(`%${f.q.trim().toLowerCase()}%`); w.push(`(lower(k.contract_number) LIKE $${p.length} OR lower(cl.full_name) LIKE $${p.length} OR lower(l.lot_key) = trim(both '%' from $${p.length}))`); }
  if (f.status) { p.push(f.status); w.push(`k.status=$${p.length}`); }
  if (f.client_id) { p.push(f.client_id); w.push(`k.client_id=$${p.length}`); }
  if (f.from) { p.push(f.from); w.push(`k.contract_date >= $${p.length}`); }
  if (f.to) { p.push(f.to); w.push(`k.contract_date <= $${p.length}`); }
  return q<any>(`SELECT k.*, cl.full_name client_name, cl.phone, l.lot_key, u.username responsible,
      coalesce((SELECT sum(capital) FROM payments p WHERE p.contract_id=k.id AND p.status='CONFIRMADA'),0) capital_paid
    FROM contracts k JOIN clients cl ON cl.id=k.client_id JOIN lots l ON l.id=k.lot_id LEFT JOIN users u ON u.id=k.responsible_user_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY k.contract_date DESC, k.id DESC LIMIT 1000`, p);
}

export async function getContract(id: number, db: Db = pool()) {
  const k = await one<any>(`SELECT k.*, cl.full_name client_name, cl.code client_code, cl.phone, cl.email, l.lot_key, l.lot_number, l.block, l.area_m2,
      ur.username responsible, ux.username exception_by, uc.username cancelled_by_name
    FROM contracts k JOIN clients cl ON cl.id=k.client_id JOIN lots l ON l.id=k.lot_id
    LEFT JOIN users ur ON ur.id=k.responsible_user_id LEFT JOIN users ux ON ux.id=k.exception_authorized_by LEFT JOIN users uc ON uc.id=k.cancelled_by
    WHERE k.id=$1`, [id], db);
  if (!k) throw notFound('Contrato no encontrado.');
  return k;
}

/** Resumen financiero del contrato (base del estado de cuenta). Sólo usa operaciones confirmadas. */
export async function contractSummary(id: number, today?: string) {
  const k = await getContract(id);
  const { states, cfg, today: t } = await contractState(id, { today });
  const pays = await q<any>(`SELECT p.*, u.username FROM payments p LEFT JOIN users u ON u.id=p.user_id WHERE p.contract_id=$1 ORDER BY p.effective_date, p.registered_at, p.id`, [id]);
  const ok = pays.filter((p) => p.status === 'CONFIRMADA');
  const sum = (arr: any[], f: string) => arr.reduce((s, p) => s + toCents(p[f]), 0);
  const capital = sum(ok, 'capital'); const interest = sum(ok, 'interest');
  const byConcept = (c: string) => sum(ok.filter((p) => p.concept === c), 'capital');
  const mensual = states.filter((s) => s.kind === 'MENSUAL');
  const accrued = accruedMoratorium(states, cfg);
  const interestPending = Math.max(0, accrued - sum(ok.filter((p) => p.concept === 'MORATORIO'), 'interest'));
  const capitalPending = k.status === 'CANCELADO' ? 0 : Math.max(0, toCents(k.price_agreed) - capital);
  const next = states.find((s) => s.balance > 0 && !s.override);
  return {
    contract: k, states, payments: pays, today: t,
    status: collectionStatus(k.status, states, t, cfg),
    totals: {
      price: toCents(k.price_agreed), apartado: byConcept('APARTADO'), enganche: byConcept('ENGANCHE'),
      aportaciones_capital: capital - byConcept('APARTADO') - byConcept('ENGANCHE'), interest, total_received: capital + interest,
      capital_pending: capitalPending, interest_pending: interestPending, total_pending: capitalPending + interestPending,
      n_scheduled: mensual.length, n_covered: mensual.filter((s) => s.status === 'PAGADA').length,
      n_pending: mensual.filter((s) => s.balance > 0 && !s.override).length, n_overdue: mensual.filter((s) => s.overdue).length,
      overdue_amount: states.filter((s) => s.overdue).reduce((a, s) => a + s.balance, 0),
      next_due: next?.due_date ?? null, next_amount: next?.balance ?? 0,
    },
  };
}
