'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export async function apiFetch<T = any>(url: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.form ? undefined : { 'Content-Type': 'application/json' },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login'; }
  if (!res.ok) { const e: any = new Error(data.error || `Error ${res.status}`); e.status = res.status; e.details = data.details; throw e; }
  return data as T;
}

export function newKey() {
  return (globalThis.crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function Alert({ kind = 'error', children, onClose }: { kind?: 'error' | 'success' | 'warning' | 'info'; children: React.ReactNode; onClose?: () => void }) {
  const c = { error: 'bg-red-50 text-red-800 border-red-200', success: 'bg-emerald-50 text-emerald-800 border-emerald-200', warning: 'bg-amber-50 text-amber-900 border-amber-200', info: 'bg-sky-50 text-sky-900 border-sky-200' }[kind];
  return (
    <div role="alert" className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${c}`}>
      <div>{children}</div>
      {onClose && <button className="text-xs opacity-60 hover:opacity-100" onClick={onClose} aria-label="Cerrar">✕</button>}
    </div>
  );
}

export function Modal({ open, title, children, onClose, wide }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); if (open) window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal className={`card w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h2>{title}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">✕</button></div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Botón que pide confirmación (y motivo, si se indica) antes de ejecutar una operación sensible. */
export function ConfirmAction({ label, title, message, action, needReason, danger, className, successMsg, minReason = 5 }: {
  label: string; title: string; message: React.ReactNode; action: (reason: string) => Promise<any>; needReason?: boolean; danger?: boolean; className?: string; successMsg?: string; minReason?: number;
}) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const run = async () => {
    setBusy(true); setErr(null);
    try { await action(reason); setOpen(false); setReason(''); if (successMsg) alert(successMsg); router.refresh(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className={className ?? (danger ? 'btn-danger btn-sm' : 'btn-secondary btn-sm')} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} title={title} onClose={() => !busy && setOpen(false)}>
        {err && <Alert>{err}</Alert>}
        <div className="text-sm text-slate-700">{message}</div>
        {needReason && (
          <div className="mt-4"><label className="label">Motivo (obligatorio)</label>
            <textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describa el motivo; quedará en la auditoría" /></div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={run} disabled={busy || (needReason && reason.trim().length < minReason)}>{busy ? 'Procesando…' : 'Confirmar'}</button>
        </div>
      </Modal>
    </>
  );
}

export function useForm<T extends Record<string, any>>(initial: T) {
  const [v, setV] = useState<T>(initial);
  const set = useCallback((k: keyof T, val: any) => setV((p) => ({ ...p, [k]: val })), []);
  const bind = (k: keyof T) => ({ value: v[k] ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value) });
  return { v, set, setV, bind };
}

export function LogoutButton() {
  return (
    <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-brand-100 hover:bg-white/10" onClick={async () => { await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/login'; }}>
      Cerrar sesión
    </button>
  );
}
