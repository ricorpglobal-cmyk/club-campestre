/** Todo cálculo monetario se hace en centavos enteros para evitar errores de redondeo. */
export function toCents(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`Importe inválido: ${v}`);
  return Math.round(n * 100);
}
export function fromCents(c: number): string {
  const neg = c < 0; const a = Math.abs(c);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
export const centsToNumber = (c: number) => c / 100;
const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export function mxn(v: unknown): string {
  return fmt.format(toCents(v) / 100);
}
/** Divide un total en n partes iguales a centavos; la última absorbe la diferencia. */
export function splitEven(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.round(totalCents / n);
  const parts = Array(n).fill(base);
  parts[n - 1] = totalCents - base * (n - 1);
  return parts;
}
