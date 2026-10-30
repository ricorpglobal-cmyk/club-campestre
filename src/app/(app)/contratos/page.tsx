import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { listContracts, PLAN_LABEL } from '@/lib/services/contracts';
import { PageHeader, StatusBadge, Empty, mx } from '@/components/ui';
import { mxn, toCents } from '@/lib/money';
import { fmtDate } from '@/lib/dates';
import { SP, str } from '@/lib/params';

export default async function Contracts({ searchParams }: { searchParams: SP }) {
  const u = await requirePage('contratos.ver');
  const sp = await searchParams;
  const rows = await listContracts({ q: str(sp.q), status: str(sp.status), from: str(sp.from), to: str(sp.to) });
  return (
    <>
      <PageHeader title="Contratos" subtitle={`${rows.length} contratos`} actions={<>
        {u.perms.has('contratos.importar') && <Link href="/contratos/importar" className="btn-secondary">Importar contratos</Link>}
        {u.perms.has('contratos.crear') && <Link href="/contratos/nuevo" className="btn-primary">Nuevo contrato</Link>}</>} />
      <form className="card card-pad mb-4 grid grid-cols-2 gap-3 md:grid-cols-5 no-print" method="get">
        <div className="col-span-2"><label className="label">Buscar</label><input name="q" defaultValue={str(sp.q)} className="input" placeholder="Número de contrato, cliente o lote" /></div>
        <div><label className="label">Estatus</label><select name="status" defaultValue={str(sp.status) ?? ''} className="input"><option value="">Todos</option><option value="ACTIVO">Activo</option><option value="LIQUIDADO">Liquidado</option><option value="EN_REVISION">En revisión</option><option value="CANCELADO">Cancelado</option></select></div>
        <div><label className="label">Desde</label><input type="date" name="from" defaultValue={str(sp.from)} className="input" /></div>
        <div><label className="label">Hasta</label><input type="date" name="to" defaultValue={str(sp.to)} className="input" /></div>
        <div className="col-span-2 flex gap-2 md:col-span-5"><button className="btn-primary">Filtrar</button><Link href="/contratos" className="btn-secondary">Limpiar</Link></div>
      </form>
      <div className="card overflow-x-auto">{rows.length ? <table className="tbl">
        <thead><tr><th>Contrato</th><th>Fecha</th><th>Cliente</th><th>Terreno</th><th>Plan</th><th className="num">Precio pactado</th><th className="num">Capital pagado</th><th className="num">Saldo</th><th>Estatus</th><th>Responsable</th></tr></thead>
        <tbody>{rows.map((k) => <tr key={k.id}><td className="font-medium"><Link href={`/contratos/${k.id}`}>{k.contract_number}</Link>{k.is_exception && <span className="ml-1 text-[10px] text-violet-700">especial</span>}</td>
          <td>{fmtDate(k.contract_date)}</td><td>{k.client_name}</td><td>{k.lot_key}</td><td>{PLAN_LABEL[k.plan]}</td><td className="num">{mxn(k.price_agreed)}</td><td className="num">{mxn(k.capital_paid)}</td>
          <td className="num">{k.status === 'CANCELADO' ? '—' : mx(toCents(k.price_agreed) - toCents(k.capital_paid))}</td><td><StatusBadge s={k.status} /></td><td className="text-xs">{k.responsible}</td></tr>)}</tbody></table>
        : <Empty>No hay contratos registrados.</Empty>}</div>
    </>
  );
}
