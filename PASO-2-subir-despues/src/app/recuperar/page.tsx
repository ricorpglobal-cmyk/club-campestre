'use client';
import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, Alert } from '@/components/client';
import { AuthShell } from '@/components/AuthShell';

export default function Recover() {
  const [id, setId] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const r = await apiFetch<{ mailConfigured: boolean }>('/api/auth/recover', { body: { identifier: id } }).catch(() => ({ mailConfigured: true }));
    setMsg(r.mailConfigured ? 'Si la cuenta existe y tiene correo registrado, recibirá un enlace para restablecer su contraseña (válido 1 hora).'
      : 'El envío de correos no está configurado. Solicite al administrador un enlace de restablecimiento.');
    setBusy(false);
  };
  return (
    <AuthShell>
      <form onSubmit={submit} className="space-y-4">
        <h1 className="text-lg">Recuperar acceso</h1>
        {msg ? <Alert kind="info">{msg}</Alert> : <>
          <div><label className="label">Usuario o correo</label><input className="input" value={id} onChange={(e) => setId(e.target.value)} required /></div>
          <button className="btn-primary w-full" disabled={busy}>Enviar enlace</button></>}
        <div className="text-center text-xs"><Link href="/login">Volver a iniciar sesión</Link></div>
      </form>
    </AuthShell>
  );
}
