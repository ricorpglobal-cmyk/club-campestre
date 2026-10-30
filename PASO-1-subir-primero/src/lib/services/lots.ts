import { q, one, tx, Db, pool } from '../db';
import { audit, AuditUser } from '../audit';
import { badRequest, conflict, notFound } from '../errors';

export const LOT_STATUSES = ['DISPONIBLE', 'APARTADO', 'CONTRATADO', 'LIQUIDADO', 'SUSPENDIDO', 'CANCELADO'] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];
export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  DISPONIBLE: 'Disponible', APARTADO: 'Apartado', CONTRATADO: 'Contratado', LIQUIDADO: 'Liquidado', SUSPENDIDO: 'Suspendido', CANCELADO: 'Cancelado',
};
export const PRICE_FIELDS = ['area_m2', 'cost_per_m2', 'price_cash', 'price_36', 'down_36', 'monthly_36', 'price_48', 'down_48', 'monthly_48'] as const;
export const INFO_FIELDS = ['lot_number', 'block', 'street', 'section'] as const;

export function lotKey(lotNumber: string, block?: string | null): string {
  const n = String(lotNumber).trim().toUpperCase().replace(/\s+/g, ' ').replace(/^0+(?=\d)/, '');
  const b = block ? String(block).trim().toUpperCase().replace(/\s+/g, ' ').replace(/^0+(?=\d)/, '') : '';
  return b ? `${b}-${n}` : n;
}

export type LotFilters = { q?: string; status?: string; block?: string; minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number };

export async function listLots(f: LotFilters = {}) {
  const w: string[] = []; const p: unknown[] = [];
  if (f.q) { p.push(`%${f.q.trim().toUpperCase()}%`); w.push(`(upper(l.lot_number) LIKE $${p.length} OR upper(l.lot_key) LIKE $${p.length} OR upper(coalesce(l.street,'')) LIKE $${p.length})`); }
  if (f.status) { p.push(f.status); w.push(`l.status = $${p.length}`); }
  if (f.block) { p.push(f.block.toUpperCase()); w.push(`upper(l.block) = $${p.length}`); }
  if (f.minPrice != null) { p.push(f.minPrice); w.push(`l.price_cash >= $${p.length}`); }
  if (f.maxPrice != null) { p.push(f.maxPrice); w.push(`l.price_cash <= $${p.length}`); }
  if (f.minArea != null) { p.push(f.minArea); w.push(`l.area_m2 >= $${p.length}`); }
  if (f.maxArea != null) { p.push(f.maxArea); w.push(`l.area_m2 <= $${p.length}`); }
  return q<any>(`
    SELECT l.*, c.id contract_id, c.contract_number, cl.full_name client_name, cl.id client_id
    FROM lots l
    LEFT JOIN contracts c ON c.lot_id = l.id AND c.status <> 'CANCELADO'
    LEFT JOIN clients cl ON cl.id = c.client_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    ORDER BY coalesce(l.block,''), CASE WHEN l.lot_number ~ '^\\d+$' THEN l.lot_number::int END NULLS LAST, l.lot_number`, p);
}

export async function getLot(id: number) {
  const lot = await one<any>('SELECT * FROM lots WHERE id=$1', [id]);
  if (!lot) throw notFound('Terreno no encontrado.');
  const contracts = await q<any>(`SELECT c.id, c.contract_number, c.contract_date, c.status, c.price_agreed, c.plan, cl.full_name client_name, cl.id client_id
    FROM contracts c JOIN clients cl ON cl.id=c.client_id WHERE c.lot_id=$1 ORDER BY c.contract_date DESC, c.id DESC`, [id]);
  const history = await q<any>(`SELECT h.*, u.username FROM lot_price_history h LEFT JOIN users u ON u.id=h.changed_by WHERE lot_id=$1 ORDER BY changed_at DESC`, [id]);
  return { lot, contracts, history };
}

/** Cambios manuales de estatus permitidos (los de contratado/liquidado los controla el módulo de contratos). */
const MANUAL: LotStatus[] = ['DISPONIBLE', 'APARTADO', 'SUSPENDIDO', 'CANCELADO'];

export async function setLotStatusManual(id: number, status: LotStatus, reason: string, user: AuditUser, ip: string | null) {
  if (!MANUAL.includes(status)) throw badRequest('Ese estatus lo asigna automáticamente el sistema a través de los contratos.');
  if (!reason?.trim()) throw badRequest('Indique el motivo del cambio de estatus.');
  return tx(async (c) => {
    const lot = await one<any>('SELECT * FROM lots WHERE id=$1 FOR UPDATE', [id], c);
    if (!lot) throw notFound();
    const active = await one<any>(`SELECT id FROM contracts WHERE lot_id=$1 AND status <> 'CANCELADO'`, [id], c);
    if (active) throw conflict('El terreno tiene un contrato vigente; su estatus depende del contrato.');
    await q('UPDATE lots SET status=$2, updated_at=now() WHERE id=$1', [id, status], c);
    await audit(c, user, 'CAMBIO_ESTATUS_TERRENO', { entity: 'terreno', entityId: id, before: { status: lot.status }, after: { status }, reason, ip });
  });
}

export async function updateLotInfo(id: number, data: { street?: string | null; section?: string | null; notes?: string | null }, user: AuditUser, ip: string | null) {
  return tx(async (c) => {
    const lot = await one<any>('SELECT * FROM lots WHERE id=$1 FOR UPDATE', [id], c);
    if (!lot) throw notFound();
    await q('UPDATE lots SET street=$2, section=$3, notes=$4, updated_at=now() WHERE id=$1', [id, data.street ?? null, data.section ?? null, data.notes ?? null], c);
    await audit(c, user, 'MODIFICACION_TERRENO', { entity: 'terreno', entityId: id, before: { street: lot.street, section: lot.section, notes: lot.notes }, after: data, ip });
  });
}

/** Recalcula el estatus de un terreno según sus contratos (se usa dentro de transacciones). */
export async function syncLotStatus(db: Db, lotId: number) {
  const c = await one<any>(`SELECT status FROM contracts WHERE lot_id=$1 AND status <> 'CANCELADO'`, [lotId], db);
  const lot = await one<any>('SELECT status FROM lots WHERE id=$1', [lotId], db);
  let next: string = lot.status;
  if (c) next = c.status === 'LIQUIDADO' ? 'LIQUIDADO' : 'CONTRATADO';
  else if (lot.status === 'CONTRATADO' || lot.status === 'LIQUIDADO') next = 'DISPONIBLE';
  if (next !== lot.status) await q('UPDATE lots SET status=$2, updated_at=now() WHERE id=$1', [lotId, next], db);
  return next;
}

export async function lotStatusCounts(db: Db = pool()) {
  const rows = await q<{ status: string; n: number }>('SELECT status, count(*) n FROM lots GROUP BY status', [], db);
  const o = Object.fromEntries(LOT_STATUSES.map((s) => [s, 0])) as Record<LotStatus, number>;
  for (const r of rows) o[r.status as LotStatus] = r.n;
  return o;
}
