'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert } from '@/components/client';

const MANUAL = [['DISPONIBLE', 'Disponible'], ['APARTADO', 'Apartado'], ['SUSPENDIDO', 'Suspendido'], ['CANCELADO', 'Cancelado']];
export function LotAdmin({ lot, hasActive }: { lot: any; hasActive: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState(lot.status); const [reason, setReason] = useState('');
  const [info, setInfo] = useState({ street: lot.street ?? '', section: lot.section ?? '', notes: lot.notes ?? '' });
  const [msg, setMsg] = useState<{ k: 'error' | 'success'; t: string } | null>(null);
  const run = async (body: any) => { setMsg(null); try { await apiFetch(`/api/lots/${lot.id}`, { method: 'PATCH', body }); setMsg({ k: 'success', t: 'Cambios guardados.' }); setReason(''); router.refresh(); } catch (e: any) { setMsg({ k: 'error', t: e.message }); } };
  return (
    <section className="card mb-5 p-5 no-print">
      <h2 className="mb-3">Administración del terreno</h2>
      {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-medium">Cambiar estatus comercial</div>
          {hasActive ? <p className="text-sm muted">El estatus lo controla el contrato vigente.</p> : <div className="space-y-2">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{MANUAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input className="input" placeholder="Motivo del cambio (obligatorio)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-primary btn-sm" disabled={status === lot.status || reason.trim().length < 3} onClick={() => run({ status, reason })}>Actualizar estatus</button></div>}
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Datos complementarios</div>
          <input className="input" placeholder="Calle" value={info.street} onChange={(e) => setInfo({ ...info, street: e.target.value })} />
          <input className="input" placeholder="Colonia o sección" value={info.section} onChange={(e) => setInfo({ ...info, section: e.target.value })} />
          <textarea className="input" rows={2} placeholder="Observaciones" value={info.notes} onChange={(e) => setInfo({ ...info, notes: e.target.value })} />
          <button className="btn-secondary btn-sm" onClick={() => run({ info })}>Guardar datos</button>
        </div>
      </div>
    </section>
  );
}
