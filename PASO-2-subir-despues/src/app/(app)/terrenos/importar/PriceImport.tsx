'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert, Modal } from '@/components/client';

const LABEL: Record<string, string> = { area_m2: 'm²', cost_per_m2: 'Costo m²', price_cash: 'Contado', price_36: '36 meses', down_36: 'Eng. 36', monthly_36: 'Mens. 36', price_48: '48 meses', down_48: 'Eng. 48', monthly_48: 'Mens. 48' };
const m = (v: string | null) => (v === null ? '—' : Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));

export function PriceImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [pv, setPv] = useState<any>(null); const [done, setDone] = useState<any>(null); const [confirm, setConfirm] = useState(false); const [mark, setMark] = useState(true);
  const [tab, setTab] = useState<'NUEVO' | 'ACTUALIZAR' | 'ERRORES' | 'SIN_CAMBIO'>('NUEVO');
  const upload = async () => {
    if (!file) return; setBusy(true); setErr(null); setDone(null);
    const fd = new FormData(); fd.append('file', file);
    try { const r = await apiFetch('/api/price-import', { form: fd }); setPv(r); setTab(r.summary.errores ? 'ERRORES' : r.summary.nuevos ? 'NUEVO' : 'ACTUALIZAR'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setErr(null);
    try { const r = await apiFetch(`/api/price-import/${pv.importId}/apply`, { body: { markHighlighted: mark } }); setDone({ ...r, id: pv.importId }); setPv(null); setConfirm(false); router.refresh(); }
    catch (e: any) { setErr(e.message); setConfirm(false); } finally { setBusy(false); }
  };
  const cancel = async () => { await apiFetch(`/api/price-import/${pv.importId}/cancel`, { method: 'POST' }).catch(() => {}); setPv(null); setFile(null); router.refresh(); };
  const rows = pv ? (tab === 'ERRORES' ? pv.issues : pv.changes.filter((c: any) => c.type === tab)) : [];
  return (
    <section className="card mb-5 p-5">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      {done && <Alert kind="success">Importación #{done.id} aplicada: {done.created} terrenos nuevos y {done.updated} actualizados. <a href={`/api/price-import/${done.id}/report`}>Descargar reporte de resultados</a></Alert>}
      {!pv && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1"><label className="label">1. Seleccione el archivo</label>
            <input type="file" accept=".xlsx,.csv" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <button className="btn-primary" disabled={!file || busy} onClick={upload}>{busy ? 'Leyendo archivo…' : '2. Leer y validar'}</button>
        </div>
      )}
      {pv && (
        <>
          <div className="mb-4 text-sm">Hoja <b>{pv.sheet}</b>, encabezados en la fila {pv.headerRow}. Columnas detectadas:
            <div className="mt-2 flex flex-wrap gap-1.5">{pv.headers.map((h: any) => <span key={h.col} className={`badge ${h.field ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-slate-100 text-slate-500 ring-slate-400/20'}`}>{h.header}{h.field ? '' : ' (ignorada)'}</span>)}</div></div>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
            {[['Filas válidas', pv.summary.filas_validas], ['Terrenos nuevos', pv.summary.nuevos], ['Con cambios', pv.summary.actualizados], ['Sin cambio', pv.summary.sin_cambio], ['Errores', pv.summary.errores], ['Advertencias', pv.summary.advertencias]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg border border-slate-200 p-3"><div className="text-[11px] uppercase text-slate-500">{l}</div><div className={`text-lg font-semibold ${l === 'Errores' && v ? 'text-red-700' : ''}`}>{v}</div></div>))}
          </div>
          {pv.notIncluded.length > 0 && <Alert kind="info">{pv.notIncluded.length} terrenos del catálogo no vienen en este archivo. No se borrarán ni se modificarán.</Alert>}
          {pv.summary.errores > 0 && <Alert kind="warning">Las filas con error se omitirán. Revise la pestaña "Errores" antes de confirmar.</Alert>}
          {pv.summary.resaltados > 0 && <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} />
            Marcar en observaciones los {pv.summary.resaltados} lotes resaltados en el archivo {pv.highlightNote && <span className="muted">({pv.highlightNote.slice(0, 90)}…)</span>}</label>}
          <div className="mb-2 flex gap-1 border-b border-slate-200">
            {([['NUEVO', `Nuevos (${pv.summary.nuevos})`], ['ACTUALIZAR', `Con cambios (${pv.summary.actualizados})`], ['SIN_CAMBIO', `Sin cambio (${pv.summary.sin_cambio})`], ['ERRORES', `Errores y advertencias (${pv.issues.length})`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? 'border-brand-700 font-medium text-brand-800' : 'border-transparent text-slate-500'}`}>{l}</button>))}
          </div>
          <div className="max-h-[420px] overflow-auto rounded border border-slate-100">
            {tab === 'ERRORES' ? <table className="tbl"><thead><tr><th>Fila</th><th>Lote</th><th>Nivel</th><th>Mensaje</th></tr></thead>
              <tbody>{rows.map((i: any, k: number) => <tr key={k}><td>{i.row}</td><td>{i.lote}</td><td className={i.level === 'ERROR' ? 'text-red-700' : 'text-amber-700'}>{i.level}</td><td>{i.message}</td></tr>)}</tbody></table>
            : tab === 'ACTUALIZAR' ? <table className="tbl"><thead><tr><th>Fila</th><th>Lote</th><th>Cambios</th></tr></thead>
              <tbody>{rows.map((c: any) => <tr key={c.key}><td>{c.row}</td><td className="font-medium">{c.key}</td><td className="text-xs">{Object.entries(c.diff).map(([f, d]: any) => <span key={f} className="mr-3 inline-block">{LABEL[f]}: <span className="muted line-through">{m(d.old)}</span> → <b>{m(d.new)}</b></span>)}</td></tr>)}</tbody></table>
            : <table className="tbl"><thead><tr><th>Fila</th><th>Lote</th>{tab === 'NUEVO' && Object.keys(LABEL).map((k) => <th key={k} className="num">{LABEL[k]}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 400).map((c: any) => <tr key={c.key}><td>{c.row}</td><td className="font-medium">{c.key}</td>{tab === 'NUEVO' && Object.keys(LABEL).map((k) => <td key={k} className="num">{k === 'area_m2' ? c.new[k] : m(c.new[k])}</td>)}</tr>)}</tbody></table>}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" disabled={busy || pv.summary.nuevos + pv.summary.actualizados === 0} onClick={() => setConfirm(true)}>Aplicar cambios</button>
            <button className="btn-secondary" onClick={cancel} disabled={busy}>Cancelar importación</button>
          </div>
          <Modal open={confirm} title="Confirmar importación" onClose={() => setConfirm(false)}>
            <p className="text-sm">Se darán de alta <b>{pv.summary.nuevos}</b> terrenos y se actualizarán los precios de <b>{pv.summary.actualizados}</b>. Los contratos y pagos existentes conservan sus importes pactados. La operación es transaccional y quedará en la auditoría.</p>
            <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setConfirm(false)}>Volver</button><button className="btn-primary" onClick={apply} disabled={busy}>{busy ? 'Aplicando…' : 'Confirmar y aplicar'}</button></div>
          </Modal>
        </>
      )}
    </section>
  );
}
