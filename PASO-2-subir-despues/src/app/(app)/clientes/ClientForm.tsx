'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert } from '@/components/client';

const F = [['full_name', 'Nombre completo *', 'md:col-span-2'], ['phone', 'Teléfono principal'], ['phone2', 'Teléfono adicional'], ['email', 'Correo electrónico', 'md:col-span-2'],
  ['street', 'Calle y domicilio', 'md:col-span-2'], ['ext_no', 'Núm. exterior'], ['int_no', 'Núm. interior'], ['colony', 'Colonia'], ['municipality', 'Municipio'], ['state', 'Estado'], ['zip', 'Código postal']] as const;

export function ClientForm({ initial, canFiscal, onSaved }: { initial?: any; canFiscal: boolean; onSaved?: (c: any) => void }) {
  const router = useRouter();
  const [v, setV] = useState<any>(initial ?? { state: 'Guanajuato', fiscal_doc_status: 'SIN_DOCUMENTO' });
  const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null); setOk(false);
    try {
      const r = initial?.id ? await apiFetch(`/api/clients/${initial.id}`, { method: 'PATCH', body: v }) : await apiFetch('/api/clients', { body: v });
      setOk(true); if (onSaved) onSaved(r.client); else if (!initial?.id) router.push(`/clientes/${r.client.id}`); else router.refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const inp = (k: string) => ({ value: v[k] ?? '', onChange: (e: any) => setV({ ...v, [k]: e.target.value }) });
  return (
    <form onSubmit={save}>
      {err && <Alert>{err}</Alert>}{ok && <Alert kind="success">Cliente guardado.</Alert>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {F.map(([k, l, c]) => <div key={k} className={(c as string) ?? ''}><label className="label">{l}</label><input className="input" {...inp(k)} required={k === 'full_name'} /></div>)}
      </div>
      {canFiscal && <>
        <div className="mb-2 mt-5 text-sm font-semibold text-brand-900">Información fiscal (acceso restringido)</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div><label className="label">RFC</label><input className="input uppercase" {...inp('rfc')} maxLength={13} /></div>
          <div><label className="label">Fecha de recepción de constancia</label><input type="date" className="input" {...inp('fiscal_doc_received_at')} /></div>
          <div><label className="label">Validación del documento</label><select className="input" {...inp('fiscal_doc_status')}>
            <option value="SIN_DOCUMENTO">Sin documento</option><option value="RECIBIDO">Recibido</option><option value="VALIDADO">Validado</option><option value="RECHAZADO">Rechazado</option></select></div>
          <div><label className="label">Observaciones fiscales</label><input className="input" {...inp('fiscal_notes')} /></div>
        </div></>}
      <div className="mt-3"><label className="label">Observaciones generales</label><textarea className="input" rows={2} {...inp('notes')} /></div>
      <div className="mt-4"><button className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : initial?.id ? 'Guardar cambios' : 'Dar de alta cliente'}</button></div>
    </form>
  );
}
