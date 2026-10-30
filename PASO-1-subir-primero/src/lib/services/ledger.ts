/**
 * Motor de saldos: aplica las aportaciones confirmadas sobre el calendario de cada contrato
 * y calcula estatus, saldos y atrasos. Todo en centavos enteros.
 */
import { q, one, Db, pool } from '../db';
import { toCents } from '../money';
import { diffDays, todayISO } from '../dates';
import { getConfig, SystemConfig } from '../config';

export type Kind = 'APARTADO' | 'ENGANCHE' | 'MENSUAL';
export type Item = { id: number; kind: Kind; number: number; due_date: string; amount: number; override: string | null };
export type Pay = { id: number; concept: string; capital: number; effective_date: string; registered_at?: string };
export type Application = { payment_id: number; item_id: number; amount: number };

const KIND_ORDER: Record<Kind, number> = { APARTADO: 0, ENGANCHE: 1, MENSUAL: 2 };
const sortItems = (a: Item, b: Item) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.number - b.number;

/** A qué obligaciones se dirige primero cada concepto; el excedente sigue el orden natural del calendario. */
function preferred(concept: string): Kind[] {
  switch (concept) {
    case 'APARTADO': return ['APARTADO', 'ENGANCHE'];
    case 'ENGANCHE': return ['ENGANCHE', 'APARTADO'];
    default: return ['MENSUAL'];
  }
}

/** Distribución determinista y auditable: obligación más antigua primero dentro del tipo preferido. */
export function allocate(items: Item[], payments: Pay[], alreadyPaid: Map<number, number> = new Map()) {
  const open = items.filter((i) => i.override !== 'CANCELADA' && i.override !== 'REESTRUCTURADA').sort(sortItems);
  const remaining = new Map(open.map((i) => [i.id, i.amount - (alreadyPaid.get(i.id) ?? 0)]));
  const apps: Application[] = []; const unapplied = new Map<number, number>();
  for (const p of payments) {
    let left = p.capital;
    if (left <= 0) continue;
    const pref = preferred(p.concept);
    const order = [...open.filter((i) => pref.includes(i.kind)).sort((a, b) => pref.indexOf(a.kind) - pref.indexOf(b.kind) || a.number - b.number),
                   ...open.filter((i) => !pref.includes(i.kind))];
    for (const it of order) {
      if (left <= 0) break;
      const r = remaining.get(it.id)!;
      if (r <= 0) continue;
      const amt = Math.min(r, left);
      apps.push({ payment_id: p.id, item_id: it.id, amount: amt });
      remaining.set(it.id, r - amt); left -= amt;
    }
    if (left > 0) unapplied.set(p.id, left);
  }
  return { apps, unapplied, remaining };
}

export type ItemState = Item & {
  paid: number; balance: number; status: 'POR_VENCER' | 'VENCIDA' | 'PARCIAL' | 'PAGADA' | 'CANCELADA' | 'REESTRUCTURADA';
  overdue: boolean; days_late: number; paid_date: string | null; last_payment_date: string | null;
};
export type CollectionStatus = 'AL_CORRIENTE' | 'PROXIMO_A_VENCER' | 'ATRASADO' | 'LIQUIDADO' | 'CANCELADO' | 'EN_REVISION';
export const COLLECTION_LABEL: Record<CollectionStatus, string> = {
  AL_CORRIENTE: 'Al corriente', PROXIMO_A_VENCER: 'Próximo a vencer', ATRASADO: 'Atrasado', LIQUIDADO: 'Liquidado', CANCELADO: 'Cancelado', EN_REVISION: 'En revisión',
};
export const ITEM_STATUS_LABEL: Record<ItemState['status'], string> = {
  POR_VENCER: 'Por vencer', VENCIDA: 'Vencida', PARCIAL: 'Parcialmente pagada', PAGADA: 'Pagada', CANCELADA: 'Cancelada', REESTRUCTURADA: 'Reestructurada',
};

export function itemStates(items: Item[], apps: { item_id: number; amount: number; effective_date: string }[], today: string, graceDays = 0): ItemState[] {
  return items.slice().sort(sortItems).map((it) => {
    const mine = apps.filter((a) => a.item_id === it.id).sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    const paid = mine.reduce((s, a) => s + a.amount, 0);
    const balance = Math.max(0, it.amount - paid);
    const last = mine.length ? mine[mine.length - 1].effective_date : null;
    let status: ItemState['status'];
    const late = diffDays(today, it.due_date);
    const overdue = !it.override && balance > 0 && late > graceDays;
    if (it.override === 'CANCELADA' || it.override === 'REESTRUCTURADA') status = it.override;
    else if (balance === 0) status = 'PAGADA';
    else if (paid > 0) status = 'PARCIAL';
    else status = late > 0 ? 'VENCIDA' : 'POR_VENCER';
    return { ...it, paid, balance, status, overdue, days_late: balance > 0 && late > 0 && !it.override ? late : 0,
      paid_date: balance === 0 && !it.override ? last : null, last_payment_date: last };
  });
}

export function collectionStatus(contractStatus: string, states: ItemState[], today: string, cfg: Pick<SystemConfig, 'dias_proximo_vencer' | 'dias_gracia_atraso'>): CollectionStatus {
  if (contractStatus === 'CANCELADO') return 'CANCELADO';
  if (contractStatus === 'LIQUIDADO') return 'LIQUIDADO';
  if (contractStatus === 'EN_REVISION') return 'EN_REVISION';
  if (states.some((s) => s.balance > 0 && !s.override && diffDays(today, s.due_date) > cfg.dias_gracia_atraso)) return 'ATRASADO';
  if (states.some((s) => s.balance > 0 && !s.override && diffDays(s.due_date, today) <= cfg.dias_proximo_vencer)) return 'PROXIMO_A_VENCER';
  return 'AL_CORRIENTE';
}

/** Interés moratorio simple: saldo vencido × tasa mensual / 30 × días de atraso después de la gracia. */
export function accruedMoratorium(states: ItemState[], cfg: Pick<SystemConfig, 'moratorios_activos' | 'tasa_moratoria_mensual' | 'dias_gracia_atraso'>): number {
  if (!cfg.moratorios_activos || !cfg.tasa_moratoria_mensual) return 0;
  return Math.round(states.reduce((s, it) => {
    const d = it.days_late - cfg.dias_gracia_atraso;
    return d > 0 && it.kind === 'MENSUAL' ? s + it.balance * (Number(cfg.tasa_moratoria_mensual) / 100 / 30) * d : s;
  }, 0));
}

/** Re-aplica TODAS las aportaciones confirmadas del contrato (orden: fecha efectiva, registro, id). */
export async function recomputeContract(db: Db, contractId: number) {
  const items = (await q<any>('SELECT * FROM schedule_items WHERE contract_id=$1', [contractId], db)).map(toItem);
  const pays = (await q<any>(`SELECT id, concept, capital, effective_date, registered_at FROM payments WHERE contract_id=$1 AND status='CONFIRMADA' ORDER BY effective_date, registered_at, id`, [contractId], db))
    .map((p) => ({ ...p, capital: toCents(p.capital) }));
  await q('DELETE FROM payment_applications WHERE payment_id IN (SELECT id FROM payments WHERE contract_id=$1)', [contractId], db);
  const { apps, unapplied } = allocate(items, pays);
  for (const a of apps) await q('INSERT INTO payment_applications(payment_id, schedule_item_id, amount) VALUES ($1,$2,$3)', [a.payment_id, a.item_id, (a.amount / 100).toFixed(2)], db);
  // estatus del contrato según saldo de capital
  const c = await one<any>('SELECT status, price_agreed FROM contracts WHERE id=$1', [contractId], db);
  const paidCapital = pays.reduce((s, p) => s + p.capital, 0);
  const pending = toCents(c.price_agreed) - paidCapital;
  if (c.status === 'ACTIVO' && pending <= 0) await q(`UPDATE contracts SET status='LIQUIDADO', updated_at=now() WHERE id=$1`, [contractId], db);
  if (c.status === 'LIQUIDADO' && pending > 0) await q(`UPDATE contracts SET status='ACTIVO', updated_at=now() WHERE id=$1`, [contractId], db);
  return { apps, unapplied, pending };
}

export const toItem = (r: any): Item => ({ id: r.id, kind: r.kind, number: r.number, due_date: r.due_date, amount: toCents(r.amount), override: r.status_override });

/** Estado completo de un contrato a una fecha. */
export async function contractState(contractId: number, opts: { today?: string; db?: Db; cfg?: SystemConfig } = {}) {
  const db = opts.db ?? pool();
  const cfg = opts.cfg ?? (await getConfig(db));
  const today = opts.today ?? todayISO(cfg.zona_horaria);
  const items = (await q<any>('SELECT * FROM schedule_items WHERE contract_id=$1', [contractId], db)).map(toItem);
  const apps = (await q<any>(`SELECT pa.schedule_item_id item_id, pa.amount, p.effective_date FROM payment_applications pa JOIN payments p ON p.id=pa.payment_id
     WHERE p.contract_id=$1 AND p.status='CONFIRMADA'`, [contractId], db)).map((a) => ({ ...a, amount: toCents(a.amount) }));
  const states = itemStates(items, apps, today, cfg.dias_gracia_atraso);
  return { states, today, cfg };
}

/** Estados de muchos contratos en pocas consultas (para dashboard, calendario y reportes). */
export async function bulkStates(contractIds: number[] | null, today: string, cfg: SystemConfig, db: Db = pool()) {
  const filter = contractIds ? 'WHERE si.contract_id = ANY($1)' : '';
  const params = contractIds ? [contractIds] : [];
  const items = await q<any>(`SELECT si.* FROM schedule_items si ${filter}`, params, db);
  const apps = await q<any>(`SELECT pa.schedule_item_id item_id, pa.amount, p.effective_date, p.contract_id FROM payment_applications pa JOIN payments p ON p.id=pa.payment_id
    WHERE p.status='CONFIRMADA' ${contractIds ? 'AND p.contract_id = ANY($1)' : ''}`, params, db);
  const byC = new Map<number, { items: Item[]; apps: any[] }>();
  for (const r of items) { const e = byC.get(r.contract_id) ?? { items: [], apps: [] }; e.items.push(toItem(r)); byC.set(r.contract_id, e); }
  for (const a of apps) { const e = byC.get(a.contract_id); if (e) e.apps.push({ item_id: a.item_id, amount: toCents(a.amount), effective_date: a.effective_date }); }
  const out = new Map<number, ItemState[]>();
  for (const [cid, e] of byC) out.set(cid, itemStates(e.items, e.apps, today, cfg.dias_gracia_atraso));
  return out;
}
