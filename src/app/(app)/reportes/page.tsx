import { requirePage } from '@/lib/session';
import { REPORTS } from '@/lib/services/reports';
import { METHODS, METHOD_LABEL } from '@/lib/services/payments';
import { PageHeader } from '@/components/ui';
import { q } from '@/lib/db';

export default async function Reports() {
  const u = await requirePage(['reportes.ventas', 'reportes.cobranza']);
  const can = (k: string) => u.perms.has('reportes.exportar') && u.perms.has(REPORTS[k].perm);
  const users = u.perms.has('dashboard.filtro_usuario') ? await q<any>('SELECT id, full_name FROM users ORDER BY full_name') : [];
  const kinds = Object.keys(REPORTS).filter(can);
  return (
    <>
      <PageHeader title="Reportes y exportaciones" subtitle="Genere archivos .xlsx con los filtros seleccionados. Sólo se incluye información que su usuario puede consultar; cada exportación queda registrada." />
      {!u.perms.has('reportes.exportar') && <div className="card card-pad text-sm">Su usuario no tiene permiso para exportar reportes.</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {kinds.map((k) => (
          <form key={k} action={`/api/reports/${k}`} method="get" className="card p-5">
            <h2>{REPORTS[k].title}</h2><p className="mb-3 text-xs muted">{REPORTS[k].desc}</p>
            {k === 'estado_cuenta' ? <div className="grid grid-cols-2 gap-2"><div className="col-span-2"><label className="label">Número de contrato</label><input name="contract" required className="input" /></div></div>
            : k === 'inventario' ? <div className="grid grid-cols-2 gap-2"><div><label className="label">Estatus</label><select name="status" className="input"><option value="">Todos</option>{['DISPONIBLE', 'APARTADO', 'CONTRATADO', 'LIQUIDADO', 'SUSPENDIDO', 'CANCELADO'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}</select></div><div><label className="label">Terreno</label><input name="lot" className="input" /></div></div>
            : <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {k !== 'cartera_vencida' && <><div><label className="label">Día</label><input type="date" name="day" className="input" /></div><div><label className="label">Mes</label><input type="month" name="month" className="input" /></div>
                <div><label className="label">Año</label><input type="number" name="year" min={2000} max={2100} className="input" /></div><div><label className="label">Desde</label><input type="date" name="from" className="input" /></div>
                <div><label className="label">Hasta</label><input type="date" name="to" className="input" /></div></>}
              <div><label className="label">Terreno</label><input name="lot" className="input" /></div>
              {!k.startsWith('ventas') && k !== 'cartera_vencida' && <div><label className="label">Contrato</label><input name="contract" className="input" /></div>}
              {k.startsWith('cobranza') && <div><label className="label">Forma de pago</label><select name="method" className="input"><option value="">Todas</option>{METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></div>}
              {k.startsWith('ventas') && <div><label className="label">Estatus</label><select name="status" className="input"><option value="">Vigentes</option><option value="ACTIVO">Activo</option><option value="LIQUIDADO">Liquidado</option><option value="EN_REVISION">En revisión</option></select></div>}
              {users.length > 0 && <div><label className="label">Usuario responsable</label><select name="user" className="input"><option value="">Todos</option>{users.map((x) => <option key={x.id} value={x.id}>{x.full_name}</option>)}</select></div>}
            </div>}
            <button className="btn-primary mt-4">Descargar .xlsx</button>
          </form>))}
      </div>
    </>
  );
}
