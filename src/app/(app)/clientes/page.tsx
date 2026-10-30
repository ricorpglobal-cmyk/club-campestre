import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { searchClients } from '@/lib/services/clients';
import { PageHeader, Empty, StatusBadge } from '@/components/ui';
import { SP, str } from '@/lib/params';

export default async function Clients({ searchParams }: { searchParams: SP }) {
  const u = await requirePage('clientes.ver');
  const sp = await searchParams; const fiscal = u.perms.has('clientes.fiscal');
  const rows = await searchClients(str(sp.q), fiscal, 300);
  return (
    <>
      <PageHeader title="Clientes" subtitle={`${rows.length} clientes${str(sp.q) ? ' en la búsqueda' : ''}`} actions={u.perms.has('clientes.editar') && <Link href="/clientes/nuevo" className="btn-primary">Nuevo cliente</Link>} />
      <form className="card card-pad mb-4 flex flex-wrap gap-2 no-print" method="get">
        <input name="q" defaultValue={str(sp.q)} className="input max-w-md" placeholder={`Nombre, teléfono, número de terreno, ID de cliente${fiscal ? ' o RFC' : ''}`} />
        <button className="btn-primary">Buscar</button><Link className="btn-secondary" href="/clientes">Limpiar</Link>
      </form>
      <div className="card overflow-x-auto">{rows.length ? <table className="tbl">
        <thead><tr><th>ID</th><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Municipio</th>{fiscal && <th>RFC</th>}{fiscal && <th>Constancia</th>}<th>Terrenos</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id}><td className="text-xs muted">{c.code}</td><td className="font-medium"><Link href={`/clientes/${c.id}`}>{c.full_name}</Link></td><td>{c.phone}</td><td className="text-xs">{c.email}</td><td>{c.municipality}</td>
          {fiscal && <td className="text-xs">{c.rfc}</td>}{fiscal && <td><StatusBadge s={c.fiscal_doc_status} /></td>}<td>{c.lots}</td></tr>)}</tbody></table> : <Empty>Sin clientes.</Empty>}</div>
    </>
  );
}
