'use client';
import { useState } from 'react';
import { apiFetch, Alert } from '@/components/client';
import { AuthShell } from '@/components/AuthShell';

export default function ChangePassword() {
  const [cur, setCur] = useState(''); const [n1, setN1] = useState(''); const [n2, setN2] = useState(''); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (n1 !== n2) return setErr('Las contraseñas nuevas no coinciden.');
    setBusy(true);
    try { await apiFetch('/api/auth/password', { body: { current: cur, next: n1 } }); window.location.href = '/'; }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4">
        <h1 className="text-lg">Cambiar contraseña</h1>
        <p className="text-xs muted">Por seguridad, establezca una contraseña personal. Mínimo 10 caracteres con letras y números.</p>
        {err && <Alert>{err}</Alert>}
        <div><label className="label">Contraseña actual o temporal</label><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></div>
        <div><label className="label">Nueva contraseña</label><input type="password" className="input" value={n1} onChange={(e) => setN1(e.target.value)} required autoComplete="new-password" minLength={10} /></div>
        <div><label className="label">Confirmar nueva contraseña</label><input type="password" className="input" value={n2} onChange={(e) => setN2(e.target.value)} required autoComplete="new-password" /></div>
        <button className="btn-primary w-full" disabled={busy}>Guardar</button>
      </form>
    </AuthShell>
  );
}
