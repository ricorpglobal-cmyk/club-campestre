import Link from 'next/link';
import { mxn, fromCents } from '@/lib/money';

export const mx = (cents: number | null | undefined) => (cents === null || cents === undefined ? '—' : mxn(fromCents(cents)));

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20', blue: 'bg-sky-50 text-sky-700 ring-sky-600/20', slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20', brand: 'bg-brand-50 text-brand-700 ring-brand-600/20',
};
export function Badge({ tone = 'slate', children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone] ?? TONES.slate}`}>{children}</span>;
}

const STATUS_TONE: Record<string, string> = {
  DISPONIBLE: 'green', APARTADO: 'amber', CONTRATADO: 'blue', LIQUIDADO: 'brand', SUSPENDIDO: 'slate', CANCELADO: 'red',
  ACTIVO: 'blue', EN_REVISION: 'violet', AL_CORRIENTE: 'green', PROXIMO_A_VENCER: 'amber', ATRASADO: 'red',
  POR_VENCER: 'slate', VENCIDA: 'red', PARCIAL: 'amber', PAGADA: 'green', CANCELADA: 'red', REESTRUCTURADA: 'violet', CONFIRMADA: 'green',
  SIN_DOCUMENTO: 'slate', RECIBIDO: 'amber', VALIDADO: 'green', RECHAZADO: 'red', VISTA_PREVIA: 'amber', APLICADA: 'green', ERROR: 'red',
};
const STATUS_LABEL: Record<string, string> = {
  DISPONIBLE: 'Disponible', APARTADO: 'Apartado', CONTRATADO: 'Contratado', LIQUIDADO: 'Liquidado', SUSPENDIDO: 'Suspendido', CANCELADO: 'Cancelado',
  ACTIVO: 'Activo', EN_REVISION: 'En revisión', AL_CORRIENTE: 'Al corriente', PROXIMO_A_VENCER: 'Próximo a vencer', ATRASADO: 'Atrasado',
  POR_VENCER: 'Por vencer', VENCIDA: 'Vencida', PARCIAL: 'Parcialmente pagada', PAGADA: 'Pagada', CANCELADA: 'Cancelada', REESTRUCTURADA: 'Reestructurada', CONFIRMADA: 'Confirmada',
  SIN_DOCUMENTO: 'Sin documento', RECIBIDO: 'Recibido', VALIDADO: 'Validado', RECHAZADO: 'Rechazado', VISTA_PREVIA: 'Vista previa', APLICADA: 'Aplicada', ERROR: 'Error',
};
export function StatusBadge({ s }: { s: string }) {
  return <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s] ?? s}</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'red' | 'green' | 'amber'; href?: string }) {
  const c = tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-brand-900';
  const inner = (
    <div className="card card-pad h-full">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1.5 text-xl font-semibold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="mt-1 text-xs muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block no-underline hover:opacity-90">{inner}</Link> : inner;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm muted">{children}</div>;
}

export function KV({ items, cols = 4 }: { items: [string, React.ReactNode][]; cols?: number }) {
  return (
    <dl className={`grid gap-x-6 gap-y-3 grid-cols-2 ${cols >= 3 ? 'md:grid-cols-3' : ''} ${cols >= 4 ? 'lg:grid-cols-4' : ''}`}>
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium text-slate-800">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, actions, children, pad = true }: { title: string; actions?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return (
    <section className="card mb-5 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
        <h2>{title}</h2>
        {actions && <div className="flex gap-2 no-print">{actions}</div>}
      </div>
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}
