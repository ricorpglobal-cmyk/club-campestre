import { requirePage } from '@/lib/session';
import { listContractImports } from '@/lib/services/contractImport';
import { PageHeader, Section, StatusBadge, Empty } from '@/components/ui';
import { fmtDateTime } from '@/lib/dates';
import { ContractImport } from './ContractImport';

export default async function Page() {
  await requirePage('contratos.importar');
  const hist = await listContractImports();
  return (
    <>
      <PageHeader title="Importar contratos y pagos" subtitle="Carga inicial de contratos ya firmados y de sus pagos históricos, con la plantilla del sistema." actions={<a className="btn-secondary" href="/api/contract-import/template">Descargar plantilla Excel</a>} />
      <ContractImport />
      <Section title="Historial de importaciones" pad={false}>
        {hist.length ? <table className="tbl"><thead><tr><th>#</th><th>Archivo</th><th>Usuario</th><th>Fecha</th><th>Estatus</th><th>Resultado</th></tr></thead>
          <tbody>{hist.map((h) => <tr key={h.id}><td>{h.id}</td><td>{h.filename}</td><td>{h.username}</td><td>{fmtDateTime(h.created_at)}</td><td><StatusBadge s={h.status} /></td>
            <td className="text-xs">{h.summary && `${h.summary.contratos} contratos · ${h.summary.pagos} pagos · ${h.summary.errores} errores`}</td></tr>)}</tbody></table> : <Empty>Sin importaciones.</Empty>}
      </Section>
    </>
  );
}
