'use client';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, Alert } from '@/components/client';
import { AuthShell } from '@/components/AuthShell';

export default function LoginPage() {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const r = await apiFetch<{ mustChange: boolean }>('/api/auth/login', { body: { username: u, password: p } }); window.location.href = r.mustChange ? '/cambiar-contrasena' : '/'; }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4">
        <h1 className="text-lg">Iniciar sesión</h1>
        {err && <Alert>{err}</Alert>}
        <div><label className="label" htmlFor="u">Usuario</label><input id="u" className="input" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required autoFocus /></div>
        <div><label className="label" htmlFor="p">Contraseña</label><input id="p" type="password" className="input" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></div>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Verificando…' : 'Entrar'}</button>
        <div className="text-center text-xs"><Link href="/recuperar">¿Olvidó su contraseña?</Link></div>
      </form>
    </AuthShell>
  );
}

