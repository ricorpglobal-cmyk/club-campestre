'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert } from './client';
export function DocUpload({ url, types }: { url: string; types: [string, string][] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null); const [type, setType] = useState(types[0][0]); const [msg, setMsg] = useState<{ k: any; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const up = async () => {
    if (!file) return; setBusy(true); setMsg(null);
    const fd = new FormData(); fd.append('file', file); fd.append('doc_type', type);
    try { await apiFetch(url, { form: fd }); setMsg({ k: 'success', t: 'Documento cargado.' }); setFile(null); router.refresh(); } catch (e: any) { setMsg({ k: 'error', t: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="no-print">
      {msg && <Alert kind={msg.k}>{msg.t}</Alert>}
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label">Tipo</label><select className="input" value={type} onChange={(e) => setType(e.target.value)}>{types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="min-w-[240px] flex-1"><label className="label">Archivo PDF, JPG o PNG (máx. 10 MB)</label><input type="file" accept=".pdf,.jpg,.jpeg,.png" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <button className="btn-secondary" disabled={!file || busy} onClick={up}>{busy ? 'Cargando…' : 'Adjuntar'}</button>
      </div>
    </div>
  );
}
