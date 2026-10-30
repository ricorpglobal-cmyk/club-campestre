'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, Alert } from '@/components/client';
import { AuthShell } from '@/components/AuthShell';

function Form() {
  const token = useSearchParams().get('token') ?? '';
  const [n1, setN1] = useState(''); const [n2, setN2] = useState(''); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (n1 !== n2) return setErr('Las contraseñas no coinciden.');
    try { await apiFetch('/api/auth/reset', { body: { token, password: n1 } }); setOk(true); } catch (e: any) { setErr(e.message); }
  };
  return ok ? <Alert kind="success">Contraseña actualizada. <Link href="/login">Iniciar sesión</Link></Alert> : (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg">Restablecer contraseña</h1>
      {err && <Alert>{err}</Alert>}
      <div><label className="label">Nueva contraseña</label><input type="password" className="input" value={n1} onChange={(e) => setN1(e.target.value)} required minLength={10} autoComplete="new-password" /></div>
      <div><label className="label">Confirmar</label><input type="password" className="input" value={n2} onChange={(e) => setN2(e.target.value)} required autoComplete="new-password" /></div>
      <button className="btn-primary w-full">Guardar</button>
    </form>
  );
}
export default function Reset() { return <AuthShell><Suspense><Form /></Suspense></AuthShell>; }
