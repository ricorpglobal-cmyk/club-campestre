'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert, Modal } from '@/components/client';
const m = (v: any) => Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export function ContractImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [pv, setPv] = useState<any>(null); const [done, setDone] = useState<any>(null); const [confirm, setConfirm] = useState(false);
  const upload = async () => { if (!file) return; setBusy(true); setErr(null); setDone(null); const fd = new FormData(); fd.append('file', file);
    try { setPv(await apiFetch('/api/contract-import', { form: fd })); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const apply = async () => { setBusy(true); setErr(null);
    try { setDone(await apiFetch(`/api/contract-import/${pv.importId}/apply`, { method: 'POST' })); setPv(null); router.refresh(); } catch (e: any) { setErr(e.message + (e.details ? ' ' + e.details.slice(0, 5).map((d: any) => `[${d.sheet} fila ${d.row}: ${d.message}]`).join(' ') : '')); } finally { setBusy(false); setConfirm(false); } };
  const cancel = async () => { await apiFetch(`/api/contract-import/${pv.importId}/cancel`, { method: 'POST' }).catch(() => {}); setPv(null); router.refresh(); };
  const errors = pv?.issues.filter((i: any) => i.level === 'ERROR') ?? [];
  return (
    <section className="card mb-5 p-5">
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Descargue la plantilla y capture un contrato por fila (hoja <b>Contratos</b>) y cada pago recibido (hoja <b>Pagos</b>).</li>
        <li>Capture el precio, enganche y número de aportaciones <b>del contrato firmado</b>; pueden ser distintos a la lista actual.</li>
        <li>Cargue el archivo. El sistema valida todo; si hay un solo error, no se carga nada hasta corregirlo.</li>
      </ol>
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {done && <Alert kind="success">Importación aplicada: {done.aplicados_contratos} contratos, {done.aplicados_pagos} pagos, {done.clientes_creados} clientes.</Alert>}
      {!pv ? <div className="flex flex-wrap items-end gap-3"><div className="min-w-[280px] flex-1"><label className="label">Archivo de contratos (.xlsx)</label><input type="file" accept=".xlsx" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <button className="btn-primary" disabled={!file || busy} onClick={upload}>{busy ? 'Validando…' : 'Leer y validar'}</button></div> : <>
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[['Contratos válidos', pv.summary.contratos], ['Pagos válidos', pv.summary.pagos], ['Clientes nuevos', pv.summary.clientes_nuevos], ['Importe contratado', m(pv.summary.importe_contratado)],
            ['Capital de pagos', m(pv.summary.capital_pagos)], ['Intereses', m(pv.summary.intereses_pagos)], ['Errores', pv.summary.errores], ['Advertencias', pv.summary.advertencias]].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-slate-200 p-3"><div className="text-[11px] uppercase text-slate-500">{l}</div><div className={`font-semibold ${l === 'Errores' && v ? 'text-red-700' : ''}`}>{v}</div></div>))}
        </div>
        {pv.issues.length > 0 && <div className="mb-4 max-h-64 overflow-auto rounded border"><table className="tbl"><thead><tr><th>Hoja</th><th>Fila</th><th>Nivel</th><th>Detalle</th></tr></thead>
          <tbody>{pv.issues.map((i: any, k: number) => <tr key={k}><td>{i.sheet}</td><td>{i.row || ''}</td><td className={i.level === 'ERROR' ? 'text-red-700' : 'text-amber-700'}>{i.level}</td><td>{i.message}</td></tr>)}</tbody></table></div>}
        <div className="max-h-80 overflow-auto rounded border"><table className="tbl"><thead><tr><th>Fila</th><th>Contrato</th><th>Fecha</th><th>Lote</th><th>Plan</th><th className="num">Precio</th><th className="num">Enganche</th><th className="num">Aport.</th><th>Cliente</th><th>Estatus</th></tr></thead>
          <tbody>{pv.contracts.map((c: any) => <tr key={c.row}><td>{c.row}</td><td>{c.number}</td><td>{c.date?.split('-').reverse().join('/')}</td><td>{c.lot}</td><td>{c.plan}</td><td className="num">{m(c.price)}</td><td className="num">{m(c.enganche)}</td><td className="num">{c.n}</td>
            <td>{c.client}{c.cliente_existente && <span className="ml-1 text-[10px] text-sky-700">existente</span>}</td><td>{c.status}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex gap-2"><button className="btn-primary" disabled={busy || errors.length > 0 || (!pv.summary.contratos && !pv.summary.pagos)} onClick={() => setConfirm(true)}>{errors.length ? 'Corrija los errores para continuar' : 'Aplicar importación'}</button>
          <button className="btn-secondary" onClick={cancel}>Cancelar</button></div>
        <Modal open={confirm} title="Confirmar importación" onClose={() => setConfirm(false)}>
          <p className="text-sm">Se registrarán <b>{pv.summary.contratos}</b> contratos y <b>{pv.summary.pagos}</b> pagos en una sola operación. Los calendarios se generan con las condiciones capturadas y los pagos se aplican en orden de fecha.</p>
          <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setConfirm(false)}>Volver</button><button className="btn-primary" disabled={busy} onClick={apply}>{busy ? 'Aplicando…' : 'Confirmar'}</button></div>
        </Modal></>}
    </section>
  );
}
