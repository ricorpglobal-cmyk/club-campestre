'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert } from '@/components/client';
export function Profile({ sessions, current }: { sessions: any[]; current: string }) {
  const router = useRouter(); const [c, setC] = useState(''); const [n1, setN1] = useState(''); const [n2, setN2] = useState(''); const [msg, setMsg] = useState<any>(null);
  const change = async () => { setMsg(null); if (n1 !== n2) return setMsg({ k: 'error', t: 'Las contraseñas no coinciden.' });
    try { await apiFetch('/api/auth/password', { body: { current: c, next: n1 } }); setMsg({ k: 'success', t: 'Contraseña actualizada. Se cerraron sus otras sesiones.' }); setC(''); setN1(''); setN2(''); router.refresh(); } catch (e: any) { setMsg({ k: 'error', t: e.message }); } };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card p-5"><h2 className="mb-3">Cambiar contraseña</h2>{msg && <Alert kind={msg.k}>{msg.t}</Alert>}
        <div className="space-y-3"><input type="password" className="input" placeholder="Contraseña actual" value={c} onChange={(e) => setC(e.target.value)} autoComplete="current-password" />
          <input type="password" className="input" placeholder="Nueva contraseña (mín. 10, letras y números)" value={n1} onChange={(e) => setN1(e.target.value)} autoComplete="new-password" />
          <input type="password" className="input" placeholder="Confirmar nueva contraseña" value={n2} onChange={(e) => setN2(e.target.value)} autoComplete="new-password" />
          <button className="btn-primary" onClick={change} disabled={!c || !n1}>Actualizar</button></div></section>
      <section className="card p-5"><h2 className="mb-3">Mis sesiones abiertas</h2>
        <ul className="divide-y text-sm">{sessions.map((s) => <li key={s.id} className="flex items-center justify-between py-2"><span><span className="text-xs">{new Date(s.last_seen_at).toLocaleString('es-MX')}</span> · <span className="text-xs muted">{s.ip} · {s.user_agent?.slice(0, 50)}</span>{s.id === current && <b className="ml-1 text-xs text-brand-700">(esta)</b>}</span>
          {s.id !== current && <button className="btn-ghost btn-sm text-red-700" onClick={async () => { await apiFetch(`/api/sessions/${s.id}`, { method: 'DELETE' }); router.refresh(); }}>Cerrar</button>}</li>)}</ul></section>
    </div>
  );
}
