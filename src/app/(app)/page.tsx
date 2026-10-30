import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { dashboard, monthly, yearly } from '@/lib/services/analytics';
import { PageHeader, Stat, Section, mx, Empty, StatusBadge } from '@/components/ui';
import { SalesVsCollection, Donut, HBars, YearLines } from '@/components/Charts';
import { fmtDate } from '@/lib/dates';
import { SP, str, int, rangeFrom, qs } from '@/lib/params';
import { q } from '@/lib/db';
import { METHOD_LABEL } from '@/lib/services/payments';
import { COLLECTION_LABEL } from '@/lib/services/ledger';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const u = await requirePage('dashboard.ver');
  const sp = await searchParams;
  const r = rangeFrom(sp);
  const f = { ...r, lot: str(sp.lot), client_id: int(sp.client), status: str(sp.status), user_id: u.perms.has('dashboard.filtro_usuario') ? int(sp.user) : undefined };
  const d = await dashboard(f);
  const year = Number(str(sp.year) ?? d.today.slice(0, 4));
  const [m, y] = await Promise.all([monthly(year, f), yearly()]);
  const users = u.perms.has('dashboard.filtro_usuario') ? await q<any>('SELECT id, full_name FROM users ORDER BY full_name') : [];
  const clientName = f.client_id ? (await q<any>('SELECT full_name FROM clients WHERE id=$1', [f.client_id]))[0]?.full_name : null;
  const n = (c: number) => c / 100;
  const L = d.lots;
  const sales = d.commercial; const col = d.collection;
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Corte al ${fmtDate(d.today)} · Periodo analizado: ${fmtDate(d.period.from)} – ${fmtDate(d.period.to)}`} />
      <form className="card card-pad mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8 no-print" method="get">
        <div><label className="label">Fecha inicial</label><input type="date" name="from" defaultValue={str(sp.from)} className="input" /></div>
        <div><label className="label">Fecha final</label><input type="date" name="to" defaultValue={str(sp.to)} className="input" /></div>
        <div><label className="label">Día específico</label><input type="date" name="day" defaultValue={str(sp.day)} className="input" /></div>
        <div><label className="label">Mes</label><input type="month" name="month" defaultValue={str(sp.month)} className="input" /></div>
        <div><label className="label">Año</label><input type="number" name="year" min={2000} max={2100} defaultValue={str(sp.year)} placeholder={d.today.slice(0, 4)} className="input" /></div>
        <div><label className="label">Terreno</label><input name="lot" defaultValue={str(sp.lot)} placeholder="No. lote" className="input" /></div>
        <div><label className="label">Estatus contrato</label>
          <select name="status" defaultValue={str(sp.status) ?? ''} className="input"><option value="">Todos</option><option value="ACTIVO">Activo</option><option value="LIQUIDADO">Liquidado</option><option value="EN_REVISION">En revisión</option><option value="CANCELADO">Cancelado</option></select></div>
        {users.length > 0 ? <div><label className="label">Usuario responsable</label>
          <select name="user" defaultValue={str(sp.user) ?? ''} className="input"><option value="">Todos</option>{users.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></div> : <div />}
        {f.client_id && <input type="hidden" name="client" value={f.client_id} />}
        <div className="col-span-2 flex items-end gap-2 md:col-span-4 xl:col-span-8">
          <button className="btn-primary">Aplicar filtros</button><Link href="/" className="btn-secondary">Limpiar</Link>
          {clientName && <span className="text-sm muted">Cliente: <b>{clientName}</b></span>}
        </div>
      </form>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Indicadores comerciales — ventas contratadas</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Terrenos registrados" value={L.total} sub={`${L.DISPONIBLE} disponibles · ${L.APARTADO} apartados`} href="/terrenos" />
        <Stat label="Contratados / liquidados" value={`${L.CONTRATADO} / ${L.LIQUIDADO}`} sub={`${L.SUSPENDIDO + L.CANCELADO} suspendidos o cancelados`} />
        <Stat label="Contratos activos" value={sales.active} sub={`${sales.liquidated} liquidados`} href="/contratos" />
        <Stat label="Ventas del periodo" value={mx(sales.period.amount)} sub={`${sales.period.n} contratos · prom. ${mx(sales.avg_price)}`} />
        <Stat label="Importe total contratado" value={mx(sales.total_contracted)} sub="Contratos vigentes" />
        <Stat label="Ventas del día" value={mx(sales.day.amount)} sub={`${sales.day.n} contratos`} />
        <Stat label="Ventas del mes" value={mx(sales.month.amount)} sub={`${sales.month.n} contratos`} />
        <Stat label="Ventas del año" value={mx(sales.year.amount)} sub={`${sales.year.n} contratos`} />
        <Stat label="Enganches pactados (periodo)" value={mx(sales.period.enganche)} />
        <Stat label="Terrenos asignados (periodo)" value={sales.period.lots} />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Indicadores de cobranza — dinero efectivamente recibido</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Cobranza del periodo" value={mx(col.period.total)} sub={`${col.period.n} operaciones · capital ${mx(col.period.capital)} · interés ${mx(col.period.interest)}`} tone="green" />
        <Stat label="Cobranza del día" value={mx(col.day.total)} sub={`${col.day.n} operaciones`} />
        <Stat label="Cobranza del mes" value={mx(col.month.total)} sub={`${col.month.n} operaciones`} />
        <Stat label="Cobranza del año" value={mx(col.year.total)} sub={`${col.year.n} operaciones`} />
        <Stat label="Total histórico cobrado" value={mx(col.all.total)} />
        <Stat label="Cartera vencida" value={mx(col.overdue_amount)} sub={`${col.overdue_installments} obligaciones vencidas`} tone={col.overdue_amount ? 'red' : undefined} href="/calendario?preset=vencidas" />
        <Stat label="Saldo de capital en cartera" value={mx(col.portfolio_capital)} />
        <Stat label="Aportaciones pendientes" value={col.pending_installments} sub="Mensualidades por cubrir" />
        <Stat label="Clientes al corriente" value={col.clients_current} tone="green" />
        <Stat label="Clientes atrasados" value={col.clients_late} tone={col.clients_late ? 'red' : undefined} href="/calendario?preset=vencidas" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <div className="xl:col-span-2"><Section title={`Ventas contratadas vs. cobranza recibida — ${year}`}>
          <SalesVsCollection data={m.map((x) => ({ mes: MESES[x.month - 1], ventas: n(x.contracted), cobranza: n(x.total) }))} />
        </Section></div>
        <Section title="Terrenos por estatus">
          <Donut data={[{ name: 'Disponible', value: L.DISPONIBLE, color: '#10b981' }, { name: 'Apartado', value: L.APARTADO, color: '#f59e0b' }, { name: 'Contratado', value: L.CONTRATADO, color: '#0ea5e9' },
            { name: 'Liquidado', value: L.LIQUIDADO, color: '#2f5543' }, { name: 'Suspendido', value: L.SUSPENDIDO, color: '#94a3b8' }, { name: 'Cancelado', value: L.CANCELADO, color: '#ef4444' }]} />
        </Section>
        <Section title="Cartera por estatus de pago (saldo de capital)">
          <Donut money data={(['AL_CORRIENTE', 'PROXIMO_A_VENCER', 'ATRASADO', 'EN_REVISION', 'LIQUIDADO'] as const).map((k, i) => ({ name: COLLECTION_LABEL[k], value: n(d.carteraByStatus[k]?.pending ?? 0), color: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#2f5543'][i] }))} />
        </Section>
        <Section title="Cobranza del periodo por forma de pago">
          {d.byMethod.length ? <HBars data={d.byMethod.map((x) => ({ name: METHOD_LABEL[x.method], value: n(x.total) }))} /> : <Empty>Sin cobranza en el periodo.</Empty>}
        </Section>
        <Section title="Próximos vencimientos (15 días)" pad={false}>
          {d.upcoming.length ? <table className="tbl"><tbody>{d.upcoming.map((x, i) => (
            <tr key={i}><td className="whitespace-nowrap">{fmtDate(x.due_date)}</td><td><Link href={`/contratos/${x.contract_id}`}>{x.client_name}</Link><div className="text-xs muted">Lote {x.lot_key} · {x.kind === 'MENSUAL' ? `Aport. ${x.number}` : x.kind.toLowerCase()}</div></td><td className="num">{mx(x.balance)}</td></tr>))}</tbody></table>
            : <Empty>Sin vencimientos próximos.</Empty>}
        </Section>
      </div>

      <Section title={`Comparativo mensual ${year}`} pad={false} actions={<form className="flex gap-2" method="get"><input type="number" name="year" defaultValue={year} className="input w-24 py-1" /><button className="btn-secondary btn-sm">Ver año</button></form>}>
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Mes</th><th className="num">Contratos nuevos</th><th className="num">Importe contratado</th><th className="num">Enganches recibidos</th><th className="num">Aportaciones de capital</th><th className="num">Intereses</th><th className="num">Total cobrado</th><th className="num">Aport. vencidas</th><th className="num">Saldo pendiente</th></tr></thead>
          <tbody>{m.map((x) => (
            <tr key={x.month}><td><Link href={`/?${qs({ month: `${year}-${String(x.month).padStart(2, '0')}` })}`}>{MESES[x.month - 1]}</Link></td><td className="num">{x.contracts}</td><td className="num">{mx(x.contracted)}</td><td className="num">{mx(x.enganche)}</td>
              <td className="num">{mx(x.aportaciones)}</td><td className="num">{mx(x.interest)}</td><td className="num font-medium">{mx(x.total)}</td><td className="num">{x.overdue_items || ''}</td><td className="num">{x.pending === null ? '' : mx(x.pending)}</td></tr>))}
            <tr className="bg-slate-50 font-semibold"><td>Total</td><td className="num">{m.reduce((a, x) => a + x.contracts, 0)}</td><td className="num">{mx(m.reduce((a, x) => a + x.contracted, 0))}</td><td className="num">{mx(m.reduce((a, x) => a + x.enganche, 0))}</td>
              <td className="num">{mx(m.reduce((a, x) => a + x.aportaciones, 0))}</td><td className="num">{mx(m.reduce((a, x) => a + x.interest, 0))}</td><td className="num">{mx(m.reduce((a, x) => a + x.total, 0))}</td><td className="num">{m.reduce((a, x) => a + x.overdue_items, 0)}</td><td /></tr>
          </tbody></table></div>
      </Section>

      <Section title="Comparativo anual">
        {y.length ? <div className="grid gap-5 lg:grid-cols-2"><YearLines data={y.map((x) => ({ year: String(x.year), ventas: n(x.contracted), cobranza: n(x.total) }))} />
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Año</th><th className="num">Contratos</th><th className="num">Contratado</th><th className="num">Capital cobrado</th><th className="num">Intereses</th><th className="num">Total cobrado</th></tr></thead>
            <tbody>{y.map((x) => <tr key={x.year}><td><Link href={`/?year=${x.year}`}>{x.year}</Link></td><td className="num">{x.contracts}</td><td className="num">{mx(x.contracted)}</td><td className="num">{mx(x.capital)}</td><td className="num">{mx(x.interest)}</td><td className="num">{mx(x.total)}</td></tr>)}</tbody></table></div></div>
          : <Empty>Aún no hay contratos ni cobranza registrados.</Empty>}
      </Section>
    </>
  );
}
