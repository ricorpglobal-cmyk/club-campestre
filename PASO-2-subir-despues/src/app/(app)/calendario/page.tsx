import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { calendar } from '@/lib/services/analytics';
import { PageHeader, StatusBadge, Empty, mx } from '@/components/ui';
import { fmtDate } from '@/lib/dates';
import { SP, str, int, qs } from '@/lib/params';

const PRESETS = [['hoy', 'Hoy'], ['manana', 'Mañana'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['vencidas', 'Vencidas'], ['proximas', 'Próximas a vencer'], ['parciales', 'Pagos parciales']];

export default async function Calendar({ searchParams }: { searchParams: SP }) {
  await requirePage('calendario.ver');
  const sp = await searchParams;
  const preset = str(sp.preset) ?? (str(sp.from) || str(sp.to) || str(sp.contract) || str(sp.lot) || str(sp.status) ? undefined : 'mes');
  const c = await calendar({ preset, from: str(sp.from), to: str(sp.to), contract: str(sp.contract), lot: str(sp.lot), status: str(sp.status), client_id: int(sp.client) });
  const tot = (f: 'amount' | 'paid' | 'balance') => c.rows.reduce((a, r) => a + r[f], 0);
  return (
    <>
      <PageHeader title="Calendario de cobros" subtitle={c.from || c.to ? `Del ${fmtDate(c.from) || 'inicio'} al ${fmtDate(c.to) || '…'} · ${c.rows.length} obligaciones` : `${c.rows.length} obligaciones`} />
      <div className="mb-3 flex flex-wrap gap-1.5 no-print">{PRESETS.map(([k, l]) => <Link key={k} href={`/calendario?preset=${k}`} className={`btn-sm ${preset === k ? 'btn-primary' : 'btn-secondary'}`}>{l}</Link>)}</div>
      <form className="card card-pad mb-4 grid grid-cols-2 gap-3 md:grid-cols-6 no-print" method="get">
        <div><label className="label">Desde</label><input type="date" name="from" defaultValue={str(sp.from)} className="input" /></div>
        <div><label className="label">Hasta</label><input type="date" name="to" defaultValue={str(sp.to)} className="input" /></div>
        <div><label className="label">Contrato</label><input name="contract" defaultValue={str(sp.contract)} className="input" /></div>
        <div><label className="label">Terreno</label><input name="lot" defaultValue={str(sp.lot)} className="input" /></div>
        <div><label className="label">Estatus</label><select name="status" defaultValue={str(sp.status) ?? ''} className="input"><option value="">Todos</option>
          {[['POR_VENCER', 'Por vencer'], ['VENCIDA', 'Vencida'], ['PARCIAL', 'Parcialmente pagada'], ['PAGADA', 'Pagada'], ['CANCELADA', 'Cancelada']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="flex items-end gap-2"><button className="btn-primary">Filtrar</button><Link className="btn-secondary" href="/calendario">Limpiar</Link></div>
      </form>
      <div className="card overflow-x-auto">{c.rows.length ? <table className="tbl">
        <thead><tr><th>Vencimiento</th><th>Cliente</th><th>Teléfono</th><th>Contrato</th><th>Terreno</th><th>Obligación</th><th className="num">Programado</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Fecha real de pago</th><th className="num">Días de atraso</th><th>Estatus</th><th /></tr></thead>
        <tbody>{c.rows.map((r) => <tr key={r.id} className={r.overdue ? 'bg-red-50/40' : ''}>
          <td className="whitespace-nowrap font-medium">{fmtDate(r.due_date)}</td><td><Link href={`/clientes/${r.client_id}`}>{r.client_name}</Link></td><td className="text-xs">{r.phone}</td><td><Link href={`/contratos/${r.contract_id}`}>{r.contract_number}</Link></td><td>{r.lot_key}</td>
          <td>{r.kind === 'MENSUAL' ? `Aportación ${r.number}` : r.kind === 'ENGANCHE' ? 'Enganche' : 'Apartado'}</td><td className="num">{mx(r.amount)}</td><td className="num">{mx(r.paid)}</td><td className="num font-medium">{mx(r.balance)}</td>
          <td>{fmtDate(r.paid_date)}</td><td className={`num ${r.days_late ? 'text-red-700' : ''}`}>{r.days_late || ''}</td><td><StatusBadge s={r.status} /></td>
          <td>{r.balance > 0 && !r.override && <Link className="btn-ghost btn-sm" href={`/aportaciones/nueva?contract=${r.contract_id}`}>Cobrar</Link>}</td></tr>)}
          <tr className="bg-slate-50 font-semibold"><td colSpan={6}>Total</td><td className="num">{mx(tot('amount'))}</td><td className="num">{mx(tot('paid'))}</td><td className="num">{mx(tot('balance'))}</td><td colSpan={4} /></tr></tbody></table>
        : <Empty>Sin obligaciones para los filtros seleccionados.</Empty>}</div>
    </>
  );
}
