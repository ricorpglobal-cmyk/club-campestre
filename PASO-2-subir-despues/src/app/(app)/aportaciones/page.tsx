import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { listPayments, CONCEPT_LABEL, METHOD_LABEL, CONCEPTS, METHODS } from '@/lib/services/payments';
import { PageHeader, StatusBadge, Empty, mx } from '@/components/ui';
import { mxn, toCents } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { SP, str, rangeFrom } from '@/lib/params';
import { CancelPaymentButton } from '../contratos/[id]/Actions';

export default async function Payments({ searchParams }: { searchParams: SP }) {
  const u = await requirePage('aportaciones.ver');
  const sp = await searchParams; const r = rangeFrom(sp);
  const rows = await listPayments({ ...r, method: str(sp.method), concept: str(sp.concept), status: str(sp.status), q: str(sp.q), limit: 1000 });
  const ok = rows.filter((p) => p.status === 'CONFIRMADA');
  const sum = (f: string) => ok.reduce((a, p) => a + toCents(p[f]), 0);
  return (
    <>
      <PageHeader title="Aportaciones" subtitle="Cada aportación es una operación independiente. Las canceladas se conservan pero no suman." actions={u.perms.has('aportaciones.registrar') && <Link href="/aportaciones/nueva" className="btn-primary">Registrar aportación</Link>} />
      <form className="card card-pad mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8 no-print" method="get">
        <div className="col-span-2"><label className="label">Buscar</label><input name="q" defaultValue={str(sp.q)} className="input" placeholder="Recibo, cliente, contrato o referencia" /></div>
        <div><label className="label">Desde</label><input type="date" name="from" defaultValue={str(sp.from)} className="input" /></div>
        <div><label className="label">Hasta</label><input type="date" name="to" defaultValue={str(sp.to)} className="input" /></div>
        <div><label className="label">Mes</label><input type="month" name="month" defaultValue={str(sp.month)} className="input" /></div>
        <div><label className="label">Concepto</label><select name="concept" defaultValue={str(sp.concept) ?? ''} className="input"><option value="">Todos</option>{CONCEPTS.map((c) => <option key={c} value={c}>{CONCEPT_LABEL[c]}</option>)}</select></div>
        <div><label className="label">Forma de pago</label><select name="method" defaultValue={str(sp.method) ?? ''} className="input"><option value="">Todas</option>{METHODS.map((c) => <option key={c} value={c}>{METHOD_LABEL[c]}</option>)}</select></div>
        <div><label className="label">Estatus</label><select name="status" defaultValue={str(sp.status) ?? ''} className="input"><option value="">Todos</option><option value="CONFIRMADA">Confirmada</option><option value="CANCELADA">Cancelada</option></select></div>
        <div className="col-span-2 flex gap-2 md:col-span-4 xl:col-span-8"><button className="btn-primary">Filtrar</button><Link href="/aportaciones" className="btn-secondary">Limpiar</Link>
          <span className="ml-auto self-center text-sm">Confirmadas: <b>{ok.length}</b> · Capital <b>{mx(sum('capital'))}</b> · Interés <b>{mx(sum('interest'))}</b> · Total <b>{mx(sum('total'))}</b></span></div>
      </form>
      <div className="card overflow-x-auto">{rows.length ? <table className="tbl">
        <thead><tr><th>Fecha efectiva</th><th>Recibo</th><th>Cliente</th><th>Contrato</th><th>Terreno</th><th>Concepto</th><th className="num">Capital</th><th className="num">Interés</th><th className="num">Total</th><th>Forma</th><th>Referencia</th><th>Registro</th><th>Estatus</th><th /></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.id} className={p.status === 'CANCELADA' ? 'opacity-60' : ''}>
          <td>{fmtDate(p.effective_date)}</td><td className="font-medium">{p.receipt_number}</td><td><Link href={`/clientes/${p.client_id}`}>{p.client_name}</Link></td><td><Link href={`/contratos/${p.contract_id}`}>{p.contract_number}</Link></td><td>{p.lot_key}</td>
          <td>{CONCEPT_LABEL[p.concept]}</td><td className="num">{mxn(p.capital)}</td><td className="num">{mxn(p.interest)}</td><td className="num font-medium">{mxn(p.total)}</td><td>{METHOD_LABEL[p.method]}</td><td className="text-xs">{p.reference}</td>
          <td className="text-xs muted">{fmtDateTime(p.registered_at)}<br />{p.username}</td>
          <td><StatusBadge s={p.status} />{p.status === 'CANCELADA' && <div className="text-[10px] muted" title={p.cancel_reason}>{p.cancelled_by}: {p.cancel_reason?.slice(0, 40)}</div>}</td>
          <td className="whitespace-nowrap"><a className="btn-ghost btn-sm" href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer">Recibo</a>{p.status === 'CONFIRMADA' && u.perms.has('aportaciones.cancelar') && <CancelPaymentButton id={p.id} receipt={p.receipt_number} />}</td></tr>)}</tbody></table>
        : <Empty>Sin aportaciones en la consulta.</Empty>}</div>
    </>
  );
}
