export const DEFAULT_TZ = 'America/Mexico_City';

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del proyecto. */
export function todayISO(tz = DEFAULT_TZ, now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** Suma meses a una fecha respetando el día de pago; si el mes es más corto se usa su último día. */
export function addMonthsOnDay(iso: string, months: number, payDay?: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm0 = ((total % 12) + 12) % 12;
  const day = Math.min(payDay ?? d, daysInMonth(ny, nm0));
  return `${ny}-${String(nm0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  const pa = a.split('-').map(Number); const pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000);
}
/** DD/MM/AAAA */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = typeof iso === 'string' ? iso.slice(0, 10) : new Date(iso as any).toISOString().slice(0, 10);
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDateTime(ts: Date | string | null | undefined, tz = DEFAULT_TZ): string {
  if (!ts) return '';
  return new Intl.DateTimeFormat('es-MX', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
}
export function monthBounds(year: number, month: number): [string, string] {
  const s = `${year}-${String(month).padStart(2, '0')}-01`;
  return [s, addDays(addMonthsOnDay(s, 1, 1), -1)];
}
/** Acepta DD/MM/AAAA, YYYY-MM-DD, Date o número de serie de Excel. */
export function parseFlexibleDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return dt.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (isISODate(s.slice(0, 10)) && /^\d{4}-/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}
