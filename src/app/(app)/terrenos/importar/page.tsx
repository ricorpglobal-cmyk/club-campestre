import { requirePage } from '@/lib/session';
import { listPriceImports } from '@/lib/services/priceImport';
import { PageHeader, Section, StatusBadge, Empty } from '@/components/ui';
import { fmtDateTime } from '@/lib/dates';
import { PriceImport } from './PriceImport';

export default async function Page() {
  await requirePage('precios.importar');
  const hist = await listPriceImports();
  return (
    <>
      <PageHeader title="Importar lista de precios" subtitle="Cargue un archivo .xlsx o .csv. Verá una vista previa con los cambios antes de aplicarlos; los contratos existentes no se modifican." />
      <PriceImport />
      <Section title="Historial de importaciones" pad={false}>
        {hist.length ? <table className="tbl"><thead><tr><th>#</th><th>Archivo</th><th>Usuario</th><th>Fecha</th><th>Estatus</th><th>Resultado</th><th /></tr></thead>
          <tbody>{hist.map((h) => <tr key={h.id}><td>{h.id}</td><td>{h.filename}</td><td>{h.username}</td><td>{fmtDateTime(h.created_at)}</td><td><StatusBadge s={h.status} /></td>
            <td className="text-xs">{h.summary && `${h.summary.aplicados_nuevos ?? h.summary.nuevos} nuevos · ${h.summary.aplicados_actualizados ?? h.summary.actualizados} actualizados · ${h.summary.errores} errores`}</td>
            <td><a className="btn-ghost btn-sm" href={`/api/price-import/${h.id}/report`}>Reporte</a></td></tr>)}</tbody></table> : <Empty>Sin importaciones.</Empty>}
      </Section>
    </>
  );
}
