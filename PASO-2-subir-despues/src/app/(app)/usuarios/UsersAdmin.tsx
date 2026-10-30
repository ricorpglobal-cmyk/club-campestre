'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert, Modal } from '@/components/client';
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' }) : '—');

export function UsersAdmin({ users, sessions, me, perms, rolePerms, roleLabel, adminOnly }: any) {
  const router = useRouter();
  const [edit, setEdit] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [info, setInfo] = useState<React.ReactNode>(null); const [busy, setBusy] = useState(false);
  const active = users.filter((u: any) => u.is_active).length;
  const blank = { username: '', full_name: '', email: '', role: 'VENTAS', extra_permissions: [], revoked_permissions: [], is_active: true };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (edit.id) { await apiFetch(`/api/users/${edit.id}`, { method: 'PATCH', body: { full_name: edit.full_name, email: edit.email, role: edit.role, extra_permissions: edit.extra_permissions, revoked_permissions: edit.revoked_permissions, is_active: edit.is_active } }); setInfo('Usuario actualizado.'); }
      else { const r = await apiFetch('/api/users', { body: edit }); setInfo(<>Usuario <b>{r.user.username}</b> creado. Contraseña temporal (se muestra sólo una vez, el usuario deberá cambiarla al entrar): <code className="rounded bg-white px-2 py-0.5 font-mono">{r.temporaryPassword}</code></>); }
      setEdit(null); router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const reset = async (u: any) => { try { const r = await apiFetch(`/api/users/${u.id}/reset`, { method: 'POST' }); setInfo(<>Enlace de restablecimiento para <b>{u.username}</b> (válido 60 min, un solo uso). Compártalo por un medio seguro:<br /><code className="break-all text-xs">{r.url}</code></>); } catch (e: any) { setErr(e.message); } };
  const revoke = async (id: string) => { await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' }); router.refresh(); };
  const roleSet = edit ? new Set(rolePerms[edit.role]) : new Set();
  const effective = (p: string) => (roleSet.has(p) || edit.extra_permissions.includes(p)) && !edit.revoked_permissions.includes(p);
  const toggle = (p: string) => {
    const on = effective(p); const e = { ...edit, extra_permissions: [...edit.extra_permissions], revoked_permissions: [...edit.revoked_permissions] };
    if (on) { e.extra_permissions = e.extra_permissions.filter((x: string) => x !== p); if (roleSet.has(p)) e.revoked_permissions.push(p); }
    else { e.revoked_permissions = e.revoked_permissions.filter((x: string) => x !== p); if (!roleSet.has(p)) e.extra_permissions.push(p); }
    setEdit(e);
  };
  return (
    <>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}{info && <Alert kind="success" onClose={() => setInfo(null)}>{info}</Alert>}
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setEdit({ ...blank, is_active: active < 10 })}>Nuevo usuario</button></div>
      <div className="card mb-5 overflow-x-auto"><table className="tbl"><thead><tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estatus</th><th>Último acceso</th><th className="num">Sesiones</th><th /></tr></thead>
        <tbody>{users.map((u: any) => <tr key={u.id} className={u.is_active ? '' : 'opacity-60'}><td className="font-medium">{u.username}</td><td>{u.full_name}</td><td className="text-xs">{u.email}</td><td>{roleLabel[u.role]}{(u.extra_permissions.length > 0 || u.revoked_permissions.length > 0) && <span className="ml-1 text-[10px] text-violet-700">personalizado</span>}</td>
          <td>{u.is_active ? <span className="badge bg-emerald-50 text-emerald-700 ring-emerald-600/20">Activo</span> : <span className="badge bg-slate-100 text-slate-600 ring-slate-500/20">Inactivo</span>}{u.locked_until && new Date(u.locked_until) > new Date() && <span className="badge ml-1 bg-red-50 text-red-700 ring-red-600/20">Bloqueado</span>}{u.must_change_password && <span className="ml-1 text-[10px] muted">cambio pendiente</span>}</td>
          <td className="text-xs">{dt(u.last_login_at)}</td><td className="num">{u.open_sessions}</td>
          <td className="whitespace-nowrap"><button className="btn-ghost btn-sm" onClick={() => setEdit({ ...u, email: u.email ?? '' })}>Editar</button>{u.is_active && u.id !== me && <button className="btn-ghost btn-sm" onClick={() => reset(u)}>Restablecer acceso</button>}</td></tr>)}</tbody></table></div>
      <section className="card overflow-x-auto"><div className="border-b border-slate-100 px-5 py-3"><h2>Sesiones abiertas</h2></div>
        <table className="tbl"><thead><tr><th>Usuario</th><th>Inicio</th><th>Última actividad</th><th>Expira</th><th>IP</th><th>Navegador</th><th /></tr></thead>
          <tbody>{sessions.map((s: any) => <tr key={s.id}><td>{s.username}</td><td className="text-xs">{dt(s.created_at)}</td><td className="text-xs">{dt(s.last_seen_at)}</td><td className="text-xs">{dt(s.expires_at)}</td><td className="text-xs">{s.ip}</td><td className="max-w-[260px] truncate text-xs" title={s.user_agent}>{s.user_agent}</td>
            <td><button className="btn-ghost btn-sm text-red-700" onClick={() => revoke(s.id)}>Cerrar</button></td></tr>)}</tbody></table></section>
      <Modal open={!!edit} title={edit?.id ? `Editar ${edit.username}` : 'Nuevo usuario'} onClose={() => setEdit(null)} wide>
        {edit && <>
          {err && <Alert>{err}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Usuario</label><input className="input" disabled={!!edit.id} value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></div>
            <div><label className="label">Nombre completo</label><input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></div>
            <div><label className="label">Correo (para recuperación)</label><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
            <div><label className="label">Rol</label><select className="input" disabled={edit.id === me} value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value, extra_permissions: [], revoked_permissions: [] })}>{Object.entries(roleLabel).map(([k, l]: any) => <option key={k} value={k}>{l}</option>)}</select></div>
            <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" disabled={edit.id === me} checked={edit.is_active} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} /> Cuenta activa {!edit.is_active || edit.id ? '' : `(${active}/10 en uso)`}</label>
          </div>
          {edit.role !== 'ADMINISTRADOR' && <div className="mt-4"><div className="mb-2 text-sm font-medium">Permisos <span className="text-xs font-normal muted">(los del rol vienen marcados; puede agregar o quitar)</span></div>
            <div className="grid grid-cols-1 gap-1 md:grid-cols-2">{Object.entries(perms).filter(([p]) => !adminOnly.includes(p)).map(([p, l]: any) => <label key={p} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={effective(p)} onChange={() => toggle(p)} />{l}{!roleSet.has(p) && effective(p) && <span className="text-violet-700">+</span>}{roleSet.has(p) && !effective(p) && <span className="text-red-700">−</span>}</label>)}</div></div>}
          <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>Guardar</button></div></>}
      </Modal>
    </>
  );
}
