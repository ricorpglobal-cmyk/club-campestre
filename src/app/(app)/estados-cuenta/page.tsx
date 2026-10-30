import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { listContracts, PLAN_LABEL } from '@/lib/services/contracts';
import { PageHeader, StatusBadge, Empty } from '@/components/ui';
import { fmtDate } from '@/lib/dates';
import { SP, str } from '@/lib/params';

export default async function Statements({ searchParams }: { searchParams: SP }) {
  await requirePage('estados.ver');
  const sp = await searchParams;
  const rows = await listContracts({ q: str(sp.q) });
  return (
    <>
      <PageHeader title="Estados de cuenta" subtitle="Seleccione un contrato para generar su estado de cuenta a partir de las operaciones confirmadas." />
      <form className="card card-pad mb-4 flex gap-2 no-print" method="get"><input name="q" defaultValue={str(sp.q)} className="input max-w-md" placeholder="Cliente, número de contrato o lote" /><button className="btn-primary">Buscar</button></form>
      <div className="card overflow-x-auto">{rows.length ? <table className="tbl"><thead><tr><th>Contrato</th><th>Cliente</th><th>Terreno</th><th>Fecha</th><th>Plan</th><th>Estatus</th><th /></tr></thead>
        <tbody>{rows.map((k) => <tr key={k.id}><td className="font-medium">{k.contract_number}</td><td>{k.client_name}</td><td>{k.lot_key}</td><td>{fmtDate(k.contract_date)}</td><td>{PLAN_LABEL[k.plan]}</td><td><StatusBadge s={k.status} /></td>
          <td className="whitespace-nowrap"><Link className="btn-ghost btn-sm" href={`/estados-cuenta/${k.id}`}>Ver</Link><a className="btn-ghost btn-sm" href={`/api/statements/${k.id}?format=pdf`}>PDF</a><a className="btn-ghost btn-sm" href={`/api/statements/${k.id}?format=xlsx`}>Excel</a></td></tr>)}</tbody></table>
        : <Empty>Sin contratos.</Empty>}</div>
    </>
  );
}
