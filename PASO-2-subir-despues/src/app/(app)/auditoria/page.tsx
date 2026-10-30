import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { q } from '@/lib/db';
import { PageHeader, Empty } from '@/components/ui';
import { fmtDateTime } from '@/lib/dates';
import { SP, str, int, qs } from '@/lib/params';

export default async function Audit({ searchParams }: { searchParams: SP }) {
  await requirePage('auditoria.ver');
  const sp = await searchParams; const page = int(sp.page) ?? 1;
  const w: string[] = []; const p: unknown[] = [];
  const add = (s: string, v: unknown) => { p.push(v); w.push(s.replace('?', `$${p.length}`)); };
  if (str(sp.user)) add('lower(username) = ?', str(sp.user)!.toLowerCase());
  if (str(sp.action)) add('action = ?', str(sp.action));
  if (str(sp.entity)) add('entity = ?', str(sp.entity));
  if (str(sp.from)) add('at >= ?::date', str(sp.from));
  if (str(sp.to)) add(`at < (?::date + 1)`, str(sp.to));
  const rows = await q<any>(`SELECT * FROM audit_log ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT 101 OFFSET ${(page - 1) * 100}`, p);
  const actions = await q<any>('SELECT DISTINCT action FROM audit_log ORDER BY 1');
  const fmt = (o: any) => (o ? Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '');
  return (
    <>
      <PageHeader title="Auditoría" subtitle="Historial inmutable de operaciones relevantes. Nadie puede modificarlo ni borrarlo (restricción en la base de datos)." />
      <form className="card card-pad mb-4 grid grid-cols-2 gap-3 md:grid-cols-6 no-print" method="get">
        <div><label className="label">Usuario</label><input name="user" defaultValue={str(sp.user)} className="input" /></div>
        <div><label className="label">Operación</label><select name="action" defaultValue={str(sp.action) ?? ''} className="input"><option value="">Todas</option>{actions.map((a) => <option key={a.action} value={a.action}>{a.action.replace(/_/g, ' ').toLowerCase()}</option>)}</select></div>
        <div><label className="label">Entidad</label><input name="entity" defaultValue={str(sp.entity)} className="input" placeholder="contrato, aportacion…" /></div>
        <div><label className="label">Desde</label><input type="date" name="from" defaultValue={str(sp.from)} className="input" /></div>
        <div><label className="label">Hasta</label><input type="date" name="to" defaultValue={str(sp.to)} className="input" /></div>
        <div className="flex items-end gap-2"><button className="btn-primary">Filtrar</button><Link href="/auditoria" className="btn-secondary">Limpiar</Link></div>
      </form>
      <div className="card overflow-x-auto">{rows.length ? <table className="tbl"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Operación</th><th>Registro</th><th>Antes</th><th>Después</th><th>Motivo</th><th>IP</th></tr></thead>
        <tbody>{rows.slice(0, 100).map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(r.at)}</td><td className="text-xs">{r.username}</td><td className="text-xs font-medium">{r.action.replace(/_/g, ' ').toLowerCase()}</td>
          <td className="text-xs">{r.entity} {r.entity_id}</td><td className="max-w-[260px] text-[11px] muted">{fmt(r.before)}</td><td className="max-w-[340px] text-[11px] muted">{fmt(r.after)}</td><td className="text-xs">{r.reason}</td><td className="text-[11px] muted">{r.ip}</td></tr>)}</tbody></table> : <Empty>Sin registros.</Empty>}</div>
      <div className="mt-3 flex gap-2">{page > 1 && <Link className="btn-secondary btn-sm" href={`/auditoria?${qs({ ...sp, page: page - 1 })}`}>Anterior</Link>}{rows.length > 100 && <Link className="btn-secondary btn-sm" href={`/auditoria?${qs({ ...sp, page: page + 1 })}`}>Siguiente</Link>}</div>
    </>
  );
}
