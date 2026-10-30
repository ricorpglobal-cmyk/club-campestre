'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from 'recharts';

const fmt = (v: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);
const short = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${v}`);
const COLORS = { sales: '#2f5543', col: '#b0955a', slate: '#94a3b8' };

export function SalesVsCollection({ data }: { data: { mes: string; ventas: number; cobranza: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={56} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v: any) => fmt(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar isAnimationActive={false} dataKey="ventas" name="Ventas contratadas" fill={COLORS.sales} radius={[3, 3, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="cobranza" name="Cobranza recibida" fill={COLORS.col} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, money }: { data: { name: string; value: number; color: string }[]; money?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const R = 62, C = 2 * Math.PI * R; let acc = 0;
  const pct = (v: number) => (!total ? '0%' : v / total < 0.01 && v > 0 ? '<1%' : `${Math.round((v / total) * 100)}%`);
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Gráfica de distribución">
        <circle cx="80" cy="80" r={R} fill="none" stroke="#eef2ef" strokeWidth="22" />
        {total > 0 && data.filter((d) => d.value > 0).map((d) => {
          const len = (d.value / total) * C; const el = (
            <circle key={d.name} cx="80" cy="80" r={R} fill="none" stroke={d.color} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)"><title>{`${d.name}: ${money ? fmt(d.value) : d.value}`}</title></circle>);
          acc += len; return el;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="11" fill="#64748b">Total</text>
        <text x="80" y="94" textAnchor="middle" fontSize="14" fontWeight="600" fill="#13251d">{money ? short(total) : total}</text>
      </svg>
      <ul className="min-w-[200px] flex-1 space-y-1.5 text-xs">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-slate-600">{d.name}</span><span className="ml-auto pl-3 font-semibold tabular-nums">{money ? fmt(d.value) : d.value}</span>
            <span className="w-10 text-right text-slate-400">{pct(d.value)}</span></li>
        ))}
      </ul>
    </div>
  );
}

export function HBars({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
        <XAxis type="number" tickFormatter={short} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: any) => fmt(Number(v))} />
        <Bar isAnimationActive={false} dataKey="value" name="Total" fill={COLORS.col} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function YearLines({ data }: { data: { year: string; ventas: number; cobranza: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={56} />
        <Tooltip formatter={(v: any) => fmt(Number(v))} /><Legend wrapperStyle={{ fontSize: 12 }} />
        <Line isAnimationActive={false} dataKey="ventas" name="Ventas contratadas" stroke={COLORS.sales} strokeWidth={2} />
        <Line isAnimationActive={false} dataKey="cobranza" name="Cobranza recibida" stroke={COLORS.col} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
