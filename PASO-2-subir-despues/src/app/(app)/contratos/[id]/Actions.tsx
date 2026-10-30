'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ConfirmAction, Alert } from '@/components/client';

export function ContractActions({ id, status, notes, canCancel, canEdit }: { id: number; status: string; notes: string | null; canCancel: boolean; canEdit: boolean }) {
  const router = useRouter(); const [n, setN] = useState(notes ?? ''); const [msg, setMsg] = useState<string | null>(null);
  if (status === 'CANCELADO' || (!canCancel && !canEdit)) return null;
  return (
    <section className="card mb-5 p-5 no-print">
      <h2 className="mb-3">Acciones</h2>
      {msg && <Alert kind="success" onClose={() => setMsg(null)}>{msg}</Alert>}
      <div className="flex flex-wrap items-end gap-3">
        {canEdit && <><div className="min-w-[280px] flex-1"><label className="label">Observaciones</label><input className="input" value={n} onChange={(e) => setN(e.target.value)} /></div>
          <button className="btn-secondary" onClick={async () => { await apiFetch(`/api/contracts/${id}`, { method: 'PATCH', body: { notes: n } }); setMsg('Observaciones guardadas.'); router.refresh(); }}>Guardar</button>
          {status !== 'LIQUIDADO' && <button className="btn-secondary" onClick={async () => { await apiFetch(`/api/contracts/${id}`, { method: 'PATCH', body: { en_revision: status !== 'EN_REVISION' } }); router.refresh(); }}>{status === 'EN_REVISION' ? 'Quitar "En revisión"' : 'Marcar "En revisión"'}</button>}</>}
        {canCancel && <ConfirmAction label="Cancelar contrato" danger needReason title="Cancelar contrato" className="btn-danger"
          message="El contrato quedará cancelado, las obligaciones pendientes se cancelarán y el terreno se liberará. Las aportaciones recibidas se conservan en el historial; si se devolverá dinero, cancele también esas aportaciones."
          action={(reason) => apiFetch(`/api/contracts/${id}/cancel`, { body: { reason } })} />}
      </div>
    </section>
  );
}

export function CancelPaymentButton({ id, receipt }: { id: number; receipt: string }) {
  return <ConfirmAction label="Cancelar" danger needReason title={`Cancelar aportación ${receipt}`} className="btn-ghost btn-sm text-red-700"
    message="La aportación no se elimina: quedará marcada como cancelada, con su motivo y usuario, y dejará de sumar a la cobranza y a los saldos."
    action={(reason) => apiFetch(`/api/payments/${id}/cancel`, { body: { reason } })} />;
}
