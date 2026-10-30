'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert, Modal, newKey } from '@/components/client';

const m = (v: any) => Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const d = (s: string) => s.split('-').reverse().join('/');
const CONCEPTS = [['MENSUAL', 'Aportación mensual'], ['ENGANCHE', 'Enganche'], ['APARTADO', 'Apartado'], ['EXTRAORDINARIO', 'Abono extraordinario'], ['LIQUIDACION', 'Liquidación'], ['MORATORIO', 'Interés moratorio'], ['AJUSTE', 'Ajuste autorizado']];
const METHODS = [['TRANSFERENCIA', 'Transferencia bancaria'], ['EFECTIVO', 'Efectivo'], ['DEPOSITO', 'Depósito'], ['CHEQUE', 'Cheque'], ['OTRO', 'Otro']];

export function PaymentForm({ today, pre, moratorios }: { today: string; pre: any; moratorios: boolean }) {
  const router = useRouter();
  const [k, setK] = useState<any>(pre); const [cq, setCq] = useState(''); const [found, setFound] = useState<any[]>([]);
  const [v, setV] = useState<any>({ effective_date: today, concept: pre?.next?.kind === 'ENGANCHE' ? 'ENGANCHE' : pre?.next?.kind === 'APARTADO' ? 'APARTADO' : 'MENSUAL', capital: pre?.next ? (pre.next.balance / 100).toFixed(2) : '', interest: '', method: 'TRANSFERENCIA', reference: '', notes: '' });
  const [pv, setPv] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [open, setOpen] = useState(false); const [dup, setDup] = useState(false); const [done, setDone] = useState<any>(null);
  const key = useRef(newKey());   // misma clave en reintentos: evita duplicar por errores de conexión
  useEffect(() => { if (cq.trim().length < 2) { setFound([]); return; } const t = setTimeout(() => apiFetch(`/api/contracts?q=${encodeURIComponent(cq)}`).then((r) => setFound(r.contracts.filter((c: any) => c.status !== 'CANCELADO'))).catch(() => {}), 250); return () => clearTimeout(t); }, [cq]);
  const body = () => ({ contract_id: k?.id, ...v, capital: v.capital || 0, interest: v.interest || 0, reference: v.reference || null, notes: v.notes || null, idempotency_key: key.current });
  const preview = async () => { setErr(null); setPv(null); try { setPv(await apiFetch('/api/payments/preview', { body: body() })); setOpen(true); } catch (e: any) { setErr(e.message); } };
  const save = async (confirmDuplicate = false) => {
    setBusy(true); setErr(null);
    try { const r = await apiFetch('/api/payments', { body: { ...body(), confirm_duplicate: confirmDuplicate || pv?.duplicate } }); setDone(r); setOpen(false); key.current = newKey(); router.refresh(); }
    catch (e: any) { if (e.details?.duplicate) setDup(true); else { setErr(e.message); setOpen(false); } } finally { setBusy(false); }
  };
  const inp = (f: string) => ({ value: v[f] ?? '', onChange: (e: any) => setV({ ...v, [f]: e.target.value }) });
  if (done) return (
    <section className="card max-w-2xl p-6">
      <Alert kind="success">Aportación registrada con el recibo <b>{done.payment.receipt_number}</b>{done.replay ? ' (ya estaba registrada; no se duplicó)' : ''}.</Alert>
      {done.distribution?.length > 0 && <ul className="mb-4 text-sm">{done.distribution.map((x: any, i: number) => <li key={i}>• {x.kind === 'MENSUAL' ? `Aportación ${x.number}` : x.kind.toLowerCase()} ({d(x.due_date)}): {m(x.amount)}</li>)}</ul>}
      <div className="flex flex-wrap gap-2"><a className="btn-primary" href={`/api/payments/${done.payment.id}/receipt`} target="_blank" rel="noreferrer">Imprimir recibo</a>
        <a className="btn-secondary" href={`/contratos/${k.id}`}>Ver contrato</a><button className="btn-secondary" onClick={() => { setDone(null); setPv(null); setV({ ...v, capital: '', interest: '', reference: '', notes: '' }); }}>Registrar otra</button></div>
    </section>);
  return (
    <section className="card max-w-3xl p-6">
      {err && <Alert onClose={() => setErr(null)}>{err}</Alert>}
      <div className="mb-4"><label className="label">Contrato</label>
        {k ? <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm"><span><b>{k.contract_number}</b> · {k.client_name} · Lote {k.lot_key}{k.pending && <> · Saldo {m(k.pending)}</>}</span><button className="btn-ghost btn-sm" onClick={() => setK(null)}>Cambiar</button></div> : <>
          <input className="input" placeholder="Buscar por número de contrato, cliente o lote…" value={cq} onChange={(e) => setCq(e.target.value)} autoFocus />
          {found.length > 0 && <ul className="mt-2 max-h-56 divide-y overflow-auto rounded border text-sm">{found.map((c) => <li key={c.id}><button className="w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setK(c); setFound([]); setCq(''); }}><b>{c.contract_number}</b> · {c.client_name} · Lote {c.lot_key}</button></li>)}</ul>}</>}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div><label className="label">Fecha efectiva de recepción</label><input type="date" className="input" max={today} {...inp('effective_date')} /></div>
        <div><label className="label">Concepto</label><select className="input" {...inp('concept')}>{CONCEPTS.filter(([c]) => c !== 'MORATORIO' || moratorios).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></div>
        <div><label className="label">Forma de pago</label><select className="input" {...inp('method')}>{METHODS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></div>
        <div><label className="label">Importe de capital</label><input type="number" min="0" step="0.01" className="input" disabled={v.concept === 'MORATORIO'} {...inp('capital')} /></div>
        <div><label className="label">Interés recibido</label><input type="number" min="0" step="0.01" className="input" {...inp('interest')} placeholder="0.00" /></div>
        <div><label className="label">Referencia (transferencia/depósito)</label><input className="input" {...inp('reference')} /></div>
        <div className="md:col-span-3"><label className="label">Observaciones</label><input className="input" {...inp('notes')} /></div>
      </div>
      <div className="mt-5"><button className="btn-primary" disabled={!k || busy} onClick={preview}>Revisar antes de guardar</button></div>
      <Modal open={open} title="Confirmar aportación" onClose={() => !busy && setOpen(false)} wide>
        {pv && <>
          {pv.warnings.map((w: string, i: number) => <Alert key={i} kind="warning">{w}</Alert>)}
          <p className="mb-3 text-sm"><b>{k?.contract_number}</b> · {k?.client_name} · {d(v.effective_date)} · Capital <b>{m(v.capital || 0)}</b>{Number(v.interest) > 0 && <> · Interés <b>{m(v.interest)}</b></>}</p>
          <p className="mb-3 text-sm">Saldo de capital: {m(pv.pending_before)} → <b>{m(pv.pending_after)}</b></p>
          {pv.distribution.length > 0 && <table className="tbl mb-3"><thead><tr><th>Se aplica a</th><th>Vencimiento</th><th className="num">Importe</th><th /></tr></thead>
            <tbody>{pv.distribution.map((x: any, i: number) => <tr key={i}><td>{x.kind === 'MENSUAL' ? `Aportación ${x.number}` : x.kind === 'ENGANCHE' ? 'Enganche' : 'Apartado'}</td><td>{d(x.due_date)}</td><td className="num">{m(x.amount)}</td><td>{x.advance && <span className="badge bg-sky-50 text-sky-700 ring-sky-600/20">Adelantada</span>}</td></tr>)}</tbody></table>}
          {dup && <Alert kind="warning">Ya existe una aportación con la misma fecha e importe. ¿Desea registrarla de todos modos?</Alert>}
          <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setOpen(false)} disabled={busy}>Corregir</button>
            <button className="btn-primary" disabled={busy} onClick={() => save(dup)}>{busy ? 'Guardando…' : dup ? 'Sí, registrar' : 'Confirmar y guardar'}</button></div></>}
      </Modal>
    </section>
  );
}
