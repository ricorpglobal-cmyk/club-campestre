import { isISODate, monthBounds } from './dates';
export type SP = Promise<Record<string, string | string[] | undefined>>;
export const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
export const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : undefined; };
export const date = (v: unknown) => (isISODate(v) ? (v as string) : undefined);
/** Resuelve día / mes / año / rango a [from, to]. */
export function rangeFrom(sp: Record<string, any>): { from?: string; to?: string } {
  if (date(sp.day)) return { from: sp.day, to: sp.day };
  if (typeof sp.month === 'string' && /^\d{4}-\d{2}$/.test(sp.month)) { const [y, m] = sp.month.split('-').map(Number); const [a, b] = monthBounds(y, m); return { from: a, to: b }; }
  if (typeof sp.year === 'string' && /^\d{4}$/.test(sp.year)) return { from: `${sp.year}-01-01`, to: `${sp.year}-12-31` };
  return { from: date(sp.from), to: date(sp.to) };
}
export const qs = (o: Record<string, any>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
