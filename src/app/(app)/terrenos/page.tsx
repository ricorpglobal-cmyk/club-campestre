import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { listLots, LOT_STATUSES, LOT_STATUS_LABEL } from '@/lib/services/lots';
import { PageHeader, StatusBadge, Empty } from '@/components/ui';
import { mxn } from '@/lib/money';
import { SP, str } from '@/lib/params';

export default async function Lots({ searchParams }: { searchParams: SP }) {
  const u = await requirePage('terrenos.ver');
  const sp = await searchParams;
  const num = (v: unknown) => (str(v) && Number.isFinite(Number(v)) ? Number(v) : undefined);
  const lots = await listLots({ q: str(sp.q), status: str(sp.status), block: str(sp.block), minPrice: num(sp.minPrice), maxPrice: num(sp.maxPrice), minArea: num(sp.minArea), maxArea: num(sp.maxArea) });
  const hasBlock = lots.some((l) => l.block);
  return (
    <>
      <PageHeader title="Terrenos" subtitle={`${lots.length} terrenos en la consulta`} actions={<>
        {u.perms.has('precios.importar') && <Link href="/terrenos/importar" className="btn-secondary">Importar lista de precios</Link>}
        {u.perms.has('reportes.exportar') && <a href="/api/reports/inventario" className="btn-secondary">Exportar inventario</a>}
        {u.perms.has('contratos.crear') && <Link href="/contratos/nuevo" className="btn-primary">Nuevo contrato</Link>}</>} />
      <form className="card card-pad mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8 no-print" method="get">
        <div className="col-span-2"><label className="label">Buscar lote / calle</label><input name="q" defaultValue={str(sp.q)} className="input" placeholder="Ej. 25" /></div>
        <div><label className="label">Estatus</label><select name="status" defaultValue={str(sp.status) ?? ''} className="input"><option value="">Todos</option>{LOT_STATUSES.map((s) => <option key={s} value={s}>{LOT_STATUS_LABEL[s]}</option>)}</select></div>
        <div><label className="label">Manzana</label><input name="block" defaultValue={str(sp.block)} className="input" /></div>
        <div><label className="label">Precio contado mín.</label><input name="minPrice" type="number" defaultValue={str(sp.minPrice)} className="input" /></div>
        <div><label className="label">Precio contado máx.</label><input name="maxPrice" type="number" defaultValue={str(sp.maxPrice)} className="input" /></div>
        <div><label className="label">m² mín.</label><input name="minArea" type="number" defaultValue={str(sp.minArea)} className="input" /></div>
        <div><label className="label">m² máx.</label><input name="maxArea" type="number" defaultValue={str(sp.maxArea)} className="input" /></div>
        <div className="col-span-2 flex gap-2 md:col-span-4 xl:col-span-8"><button className="btn-primary">Filtrar</button><Link href="/terrenos" className="btn-secondary">Limpiar</Link>
          <Link href="/terrenos?status=DISPONIBLE" className="btn-ghost">Sólo disponibles</Link></div>
      </form>
      <div className="card overflow-x-auto">
        {lots.length === 0 ? <Empty>No hay terrenos. {u.perms.has('precios.importar') && <Link href="/terrenos/importar">Importe la lista de precios</Link>}</Empty> :
        <table className="tbl">
          <thead><tr><th>Lote</th>{hasBlock && <th>Manzana</th>}<th className="num">m²</th><th className="num">Contado</th><th className="num">36 meses</th><th className="num">Eng. 36</th><th className="num">Mens. 36</th><th className="num">48 meses</th><th className="num">Eng. 48</th><th className="num">Mens. 48</th><th>Estatus</th><th>Cliente / contrato</th></tr></thead>
          <tbody>{lots.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold"><Link href={`/terrenos/${l.id}`}>{l.lot_number}</Link></td>{hasBlock && <td>{l.block}</td>}
              <td className="num">{l.area_m2 && Number(l.area_m2)}</td><td className="num">{l.price_cash && mxn(l.price_cash)}</td>
              <td className="num">{l.price_36 && mxn(l.price_36)}</td><td className="num muted">{l.down_36 && mxn(l.down_36)}</td><td className="num muted">{l.monthly_36 && mxn(l.monthly_36)}</td>
              <td className="num">{l.price_48 && mxn(l.price_48)}</td><td className="num muted">{l.down_48 && mxn(l.down_48)}</td><td className="num muted">{l.monthly_48 && mxn(l.monthly_48)}</td>
              <td><StatusBadge s={l.status} /></td>
              <td className="text-xs">{l.contract_id ? <><Link href={`/contratos/${l.contract_id}`}>{l.contract_number}</Link><div className="muted">{l.client_name}</div></> : ''}</td>
            </tr>))}</tbody>
        </table>}
      </div>
    </>
  );
}
