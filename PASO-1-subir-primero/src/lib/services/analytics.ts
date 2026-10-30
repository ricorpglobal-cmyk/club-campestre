import { q, pool } from '../db';
import { getConfig, SystemConfig } from '../config';
import { toCents } from '../money';
import { addDays, diffDays, monthBounds, todayISO } from '../dates';
import { bulkStates, collectionStatus, ItemState, CollectionStatus } from './ledger';
import { lotStatusCounts } from './lots';

export type ContractRow = {
  id: number; contract_number: string; contract_date: string; status: string; price_agreed: string; enganche: string; client_id: number; lot_id: number; plan: string;
  client_name: string; phone: string | null; lot_key: string; capital_paid: string; states: ItemState[]; collection: CollectionStatus; capital_pending: number;
  overdue_amount: number; overdue_count: number; max_days_late: number; next: ItemState | null;
};
export type Filters = { from?: string; to?: string; lot?: string; client_id?: number; status?: string; user_id?: number };

function contractWhere(f: Filters, p: unknown[], alias = 'k') {
  const w: string[] = [];
  if (f.lot) { p.push(f.lot.toUpperCase()); w.push(`${alias}.lot_id IN (SELECT id FROM lots WHERE upper(lot_key)=$${p.length} OR upper(lot_number)=$${p.length})`); }
  if (f.client_id) { p.push(f.client_id); w.push(`${alias}.client_id=$${p.length}`); }
  if (f.status) { p.push(f.status); w.push(`${alias}.status=$${p.length}`); }
  return w;
}

/** Contratos (filtrados) con su estatus de cobranza calculado. */
export async function contractsWithStatus(f: Filters, cfg: SystemConfig, today: string, includeCancelled = false): Promise<ContractRow[]> {
  const p: unknown[] = [];
  const w = contractWhere(f, p);
  if (!includeCancelled && !f.status) w.push(`k.status <> 'CANCELADO'`);
  if (f.user_id) { p.push(f.user_id); w.push(`k.responsible_user_id=$${p.length}`); }
  const ks = await q<any>(`SELECT k.id, k.contract_number, k.contract_date, k.status, k.price_agreed, k.enganche, k.client_id, k.lot_id, k.plan,
      cl.full_name client_name, cl.phone, l.lot_key,
      coalesce((SELECT sum(capital) FROM payments p WHERE p.contract_id=k.id AND p.status='CONFIRMADA'),0) capital_paid
    FROM contracts k JOIN clients cl ON cl.id=k.client_id JOIN lots l ON l.id=k.lot_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''}`, p);
  const states = await bulkStates(ks.map((k) => k.id), today, cfg);
  return ks.map((k) => {
    const st = states.get(k.id) ?? [];
    const cs = collectionStatus(k.status, st, today, cfg);
    const overdue = st.filter((s) => s.overdue);
    return { ...k, states: st, collection: cs, capital_pending: k.status === 'CANCELADO' ? 0 : toCents(k.price_agreed) - toCents(k.capital_paid),
      overdue_amount: overdue.reduce((a, s) => a + s.balance, 0), overdue_count: overdue.length,
      max_days_late: overdue.reduce((a, s) => Math.max(a, s.days_late), 0), next: st.find((s) => s.balance > 0 && !s.override) ?? null };
  });
}

async function salesBetween(from: string, to: string, f: Filters) {
  const p: unknown[] = [from, to]; const w = contractWhere(f, p);
  if (f.user_id) { p.push(f.user_id); w.push(`k.responsible_user_id=$${p.length}`); }
  const r = await q<any>(`SELECT count(*) n, coalesce(sum(price_agreed),0) amount, coalesce(sum(enganche),0) enganche, count(DISTINCT lot_id) lots
    FROM contracts k WHERE k.status <> 'CANCELADO' AND k.contract_date BETWEEN $1 AND $2 ${w.length ? 'AND ' + w.join(' AND ') : ''}`, p);
  return { n: r[0].n, amount: toCents(r[0].amount), enganche: toCents(r[0].enganche), lots: r[0].lots };
}

async function collectedBetween(from: string | null, to: string | null, f: Filters) {
  const p: unknown[] = []; const w = contractWhere(f, p);
  if (from) { p.push(from); w.push(`p.effective_date >= $${p.length}`); }
  if (to) { p.push(to); w.push(`p.effective_date <= $${p.length}`); }
  if (f.user_id) { p.push(f.user_id); w.push(`p.user_id=$${p.length}`); }
  const r = await q<any>(`SELECT count(*) n, coalesce(sum(p.capital),0) capital, coalesce(sum(p.interest),0) interest, coalesce(sum(p.total),0) total,
      count(*) FILTER (WHERE p.concept='MENSUAL') n_mensual
    FROM payments p JOIN contracts k ON k.id=p.contract_id WHERE p.status='CONFIRMADA' ${w.length ? 'AND ' + w.join(' AND ') : ''}`, p);
  return { n: r[0].n, n_mensual: r[0].n_mensual, capital: toCents(r[0].capital), interest: toCents(r[0].interest), total: toCents(r[0].total) };
}

export async function dashboard(f: Filters) {
  const cfg = await getConfig();
  const today = todayISO(cfg.zona_horaria);
  const [y, m] = today.split('-').map(Number);
  const [mFrom, mTo] = monthBounds(y, m);
  const from = f.from || mFrom; const to = f.to || mTo;
  const lots = await lotStatusCounts();
  const contracts = await contractsWithStatus(f, cfg, today);
  const active = contracts.filter((k) => ['ACTIVO', 'EN_REVISION'].includes(k.status));
  const clientsBy = (pred: (c: CollectionStatus) => boolean) => new Set(active.filter((k) => pred(k.collection)).map((k) => k.client_id)).size;
  const lateClients = new Set(active.filter((k) => k.collection === 'ATRASADO').map((k) => k.client_id));
  const upcoming = active.flatMap((k) => k.states.filter((s) => s.balance > 0 && !s.override && s.due_date >= today && s.due_date <= addDays(today, 15))
    .map((s) => ({ contract_id: k.id, contract_number: k.contract_number, client_name: k.client_name, lot_key: k.lot_key, kind: s.kind, number: s.number, due_date: s.due_date, balance: s.balance })))
    .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 12);
  const [sDay, sMonth, sYear, sPeriod] = await Promise.all([salesBetween(today, today, f), salesBetween(mFrom, mTo, f), salesBetween(`${y}-01-01`, `${y}-12-31`, f), salesBetween(from, to, f)]);
  const [cDay, cMonth, cYear, cAll, cPeriod] = await Promise.all([collectedBetween(today, today, f), collectedBetween(mFrom, mTo, f), collectedBetween(`${y}-01-01`, `${y}-12-31`, f), collectedBetween(null, null, f), collectedBetween(from, to, f)]);
  const byMethod = await q<any>(`SELECT p.method, coalesce(sum(p.total),0) total, count(*) n FROM payments p JOIN contracts k ON k.id=p.contract_id
     WHERE p.status='CONFIRMADA' AND p.effective_date BETWEEN $1 AND $2 GROUP BY p.method ORDER BY 2 DESC`, [from, to]);
  const carteraByStatus: Record<string, { n: number; pending: number }> = {};
  for (const k of contracts) { const e = (carteraByStatus[k.collection] ??= { n: 0, pending: 0 }); e.n++; e.pending += k.capital_pending; }
  return {
    today, period: { from, to },
    lots: { total: Object.values(lots).reduce((a, b) => a + b, 0), ...lots },
    commercial: {
      active: active.length, liquidated: contracts.filter((k) => k.status === 'LIQUIDADO').length,
      day: sDay, month: sMonth, year: sYear, period: sPeriod,
      total_contracted: contracts.reduce((a, k) => a + toCents(k.price_agreed), 0),
      avg_price: sPeriod.n ? Math.round(sPeriod.amount / sPeriod.n) : 0,
    },
    collection: {
      day: cDay, month: cMonth, year: cYear, all: cAll, period: cPeriod,
      pending_installments: active.reduce((a, k) => a + k.states.filter((s) => s.kind === 'MENSUAL' && s.balance > 0 && !s.override).length, 0),
      overdue_amount: active.reduce((a, k) => a + k.overdue_amount, 0),
      overdue_installments: active.reduce((a, k) => a + k.overdue_count, 0),
      clients_current: new Set(active.filter((k) => !lateClients.has(k.client_id)).map((k) => k.client_id)).size,
      clients_late: clientsBy((c) => c === 'ATRASADO'),
      portfolio_capital: active.reduce((a, k) => a + k.capital_pending, 0),
    },
    upcoming, byMethod: byMethod.map((r) => ({ method: r.method, total: toCents(r.total), n: r.n })), carteraByStatus,
  };
}

/** Comparativo enero–diciembre del año seleccionado. */
export async function monthly(year: number, f: Filters) {
  const cfg = await getConfig();
  const today = todayISO(cfg.zona_horaria);
  const p: unknown[] = [year]; const w = contractWhere(f, p);
  const wsql = w.length ? 'AND ' + w.join(' AND ') : '';
  const sales = await q<any>(`SELECT extract(month from contract_date)::int m, count(*) n, sum(price_agreed) amount FROM contracts k
    WHERE status<>'CANCELADO' AND extract(year from contract_date)=$1 ${wsql} GROUP BY 1`, p);
  const col = await q<any>(`SELECT extract(month from p.effective_date)::int m,
      sum(p.capital) FILTER (WHERE p.concept='ENGANCHE' OR p.concept='APARTADO') enganche,
      sum(p.capital) FILTER (WHERE p.concept NOT IN ('ENGANCHE','APARTADO')) aportaciones,
      sum(p.interest) interest, sum(p.total) total, count(*) n
    FROM payments p JOIN contracts k ON k.id=p.contract_id WHERE p.status='CONFIRMADA' AND extract(year from p.effective_date)=$1 ${wsql} GROUP BY 1`, p);
  const contracts = await contractsWithStatus(f, cfg, today);
  // saldo pendiente al cierre de cada mes = contratado acumulado − capital cobrado acumulado
  const pays = await q<any>(`SELECT p.effective_date, p.capital, p.contract_id FROM payments p WHERE p.status='CONFIRMADA' AND p.contract_id = ANY($1)`, [contracts.map((k) => k.id)]);
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1; const [, end] = monthBounds(year, m);
    const s = sales.find((r) => r.m === m); const c = col.find((r) => r.m === m);
    const overdueItems = contracts.reduce((a, k) => a + k.states.filter((st) => st.overdue && st.due_date.startsWith(`${year}-${String(m).padStart(2, '0')}`)).length, 0);
    const contracted = contracts.filter((k) => k.contract_date <= end).reduce((a, k) => a + toCents(k.price_agreed), 0);
    const collected = pays.filter((x) => x.effective_date <= end).reduce((a, x) => a + toCents(x.capital), 0);
    return {
      month: m, contracts: s?.n ?? 0, contracted: toCents(s?.amount ?? 0), enganche: toCents(c?.enganche ?? 0), aportaciones: toCents(c?.aportaciones ?? 0),
      interest: toCents(c?.interest ?? 0), total: toCents(c?.total ?? 0), payments: c?.n ?? 0, overdue_items: overdueItems,
      pending: monthBounds(year, m)[0] <= today ? Math.max(0, contracted - collected) : null,
    };
  });
}

export async function yearly() {
  const sales = await q<any>(`SELECT extract(year from contract_date)::int y, count(*) n, sum(price_agreed) amount FROM contracts WHERE status<>'CANCELADO' GROUP BY 1`);
  const col = await q<any>(`SELECT extract(year from effective_date)::int y, sum(capital) capital, sum(interest) interest, sum(total) total, count(*) n FROM payments WHERE status='CONFIRMADA' GROUP BY 1`);
  const years = [...new Set([...sales.map((r) => r.y), ...col.map((r) => r.y)])].sort();
  return years.map((y) => {
    const s = sales.find((r) => r.y === y); const c = col.find((r) => r.y === y);
    return { year: y, contracts: s?.n ?? 0, contracted: toCents(s?.amount ?? 0), capital: toCents(c?.capital ?? 0), interest: toCents(c?.interest ?? 0), total: toCents(c?.total ?? 0), payments: c?.n ?? 0 };
  });
}

export type CalendarFilters = { from?: string; to?: string; client_id?: number; contract?: string; lot?: string; status?: string; preset?: string };

export async function calendar(f: CalendarFilters) {
  const cfg = await getConfig();
  const today = todayISO(cfg.zona_horaria);
  let { from, to } = f;
  const weekEnd = addDays(today, 6 - ((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const [y, m] = today.split('-').map(Number);
  switch (f.preset) {
    case 'hoy': from = to = today; break;
    case 'manana': from = to = addDays(today, 1); break;
    case 'semana': from = today; to = weekEnd; break;
    case 'mes': [from, to] = monthBounds(y, m); break;
    case 'vencidas': from = undefined; to = addDays(today, -1); break;
    case 'proximas': from = today; to = addDays(today, cfg.dias_proximo_vencer); break;
  }
  const ks = await contractsWithStatus({ client_id: f.client_id, lot: f.lot }, cfg, today, f.status === 'CANCELADA');
  const rows: any[] = [];
  for (const k of ks) {
    if (f.contract && !k.contract_number.toLowerCase().includes(f.contract.toLowerCase())) continue;
    for (const s of k.states) {
      if (from && s.due_date < from) continue;
      if (to && s.due_date > to) continue;
      if (f.preset === 'vencidas' && !s.overdue) continue;
      if ((f.preset === 'proximas' || f.preset === 'hoy' || f.preset === 'manana' || f.preset === 'semana') && (s.balance === 0 || s.override)) continue;
      if (f.preset === 'parciales' && s.status !== 'PARCIAL') continue;
      if (f.status && s.status !== f.status && !(f.status === 'VENCIDA' && s.overdue)) continue;
      rows.push({ contract_id: k.id, contract_number: k.contract_number, client_id: k.client_id, client_name: k.client_name, phone: k.phone, lot_key: k.lot_key, ...s,
        days_late: s.days_late, overdue: s.overdue });
    }
  }
  rows.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.contract_number.localeCompare(b.contract_number));
  return { today, from: from ?? null, to: to ?? null, rows };
}

export async function overduePortfolio(f: Filters = {}) {
  const cfg = await getConfig();
  const today = todayISO(cfg.zona_horaria);
  const ks = await contractsWithStatus(f, cfg, today);
  return { today, rows: ks.filter((k) => k.overdue_amount > 0 && ['ACTIVO', 'EN_REVISION'].includes(k.status)).sort((a, b) => b.max_days_late - a.max_days_late) };
}
