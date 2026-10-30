'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, Alert, Modal } from '@/components/client';

const m = (v: any) => (v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }));
const d = (s: string | null) => (s ? s.split('-').reverse().join('/') : '—');

export function ContractForm({ lots, users, today, defaultMode, canException, preLot, preClient, me }: any) {
  const router = useRouter();
  const [client, setClient] = useState<any>(preClient); const [cq, setCq] = useState(''); const [found, setFound] = useState<any[]>([]);
  const [v, setV] = useState<any>({ lot_id: preLot ?? '', plan: '36', contract_date: today, apartado: '', apartado_mode: defaultMode, first_due_date: '', pay_day: '', responsible_user_id: me, notes: '' });
  const [ex, setEx] = useState<any>({ on: false, price_agreed: '', enganche: '', n_installments: '', reason: '' });
  const [pv, setPv] = useState<any>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const lot = lots.find((l: any) => String(l.id) === String(v.lot_id));
  useEffect(() => { if (cq.trim().length < 2) { setFound([]); return; } const t = setTimeout(() => apiFetch(`/api/clients?q=${encodeURIComponent(cq)}`).then((r) => setFound(r.clients)).catch(() => {}), 250); return () => clearTimeout(t); }, [cq]);
  const payload = () => ({ client_id: client?.id, lot_id: Number(v.lot_id), plan: v.plan, contract_date: v.contract_date, apartado: v.apartado || 0, apartado_mode: v.apartado_mode,
    first_due_date: v.first_due_date || null, pay_day: v.pay_day ? Number(v.pay_day) : null, responsible_user_id: v.responsible_user_id ? Number(v.responsible_user_id) : null, notes: v.notes || null,
    exception: ex.on ? { price_agreed: ex.price_agreed || undefined, enganche: ex.enganche || undefined, n_installments: ex.n_installments ? Number(ex.n_installments) : undefined, reason: ex.reason } : null });
  useEffect(() => {
    if (!v.lot_id || !v.contract_date) { setPv(null); return; }
    const t = setTimeout(() => apiFetch('/api/contracts/preview', { body: { ...payload(), client_id: client?.id ?? 1 } }).then((r) => { setPv(r); setErr(null); }).catch((e) => { setPv(null); setErr(e.message); }), 300);
    return () => clearTimeout(t);
  }, [JSON.stringify(v), JSON.stringify(ex)]);
  const save = async () => {
    setBusy(true); setErr(null);
    try { const r = await apiFetch('/api/contracts', { body: payload() }); router.push(`/contratos/${r.contract.id}`); }
    catch (e: any) { setErr(e.message); setConfirm(false); setBusy(false); }
  };
  const inp = (k: string) => ({ value: v[k] ?? '', onChange: (e: any) => setV({ ...v, [k]: e.target.value }) });
  const mens = pv?.schedule.filter((s: any) => s.kind === 'MENSUAL') ?? [];
  return (
    <div className="grid gap-5 xl:grid-cols-5">
      <div className="space-y-5 xl:col-span-2">
        {err && <Alert>{err}</Alert>}
        <section className="card p-5">
          <h2 className="mb-3">1. Cliente</h2>
          {client ? <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-sm"><span><b>{client.full_name}</b> <span className="muted">{client.code} · {client.phone}</span></span><button className="btn-ghost btn-sm" onClick={() => setClient(null)}>Cambiar</button></div> : <>
            <input className="input" placeholder="Buscar por nombre, teléfono o ID…" value={cq} onChange={(e) => setCq(e.target.value)} />
            {found.length > 0 && <ul className="mt-2 max-h-56 divide-y overflow-auto rounded border text-sm">{found.map((c) => <li key={c.id}><button className="w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setClient(c); setFound([]); setCq(''); }}><b>{c.full_name}</b> <span className="muted">{c.code} · {c.phone}</span></button></li>)}</ul>}
            <a href="/clientes/nuevo" target="_blank" className="mt-2 inline-block text-xs">+ Dar de alta un cliente nuevo (se abre en otra pestaña)</a></>}
        </section>
        <section className="card space-y-3 p-5">
          <h2>2. Terreno y plan</h2>
          <div><label className="label">Terreno disponible</label><select className="input" {...inp('lot_id')}><option value="">Seleccione…</option>
            {lots.map((l: any) => <option key={l.id} value={l.id}>Lote {l.lot_key}{l.area_m2 ? ` · ${Number(l.area_m2)} m²` : ''} · contado {m(l.price_cash)}{l.status === 'APARTADO' ? ' (apartado)' : ''}</option>)}</select></div>
          <div><label className="label">Plan de financiamiento</label><div className="grid grid-cols-3 gap-2">
            {[['CONTADO', 'Contado', lot?.price_cash], ['36', '36 meses', lot?.price_36], ['48', '48 meses', lot?.price_48]].map(([k, l, p]) => (
              <button type="button" key={k} disabled={lot && !p} onClick={() => setV({ ...v, plan: k })} className={`rounded-lg border px-3 py-2 text-left text-sm ${v.plan === k ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-300'} disabled:opacity-40`}>
                <div className="font-medium">{l}</div><div className="text-xs muted">{lot ? m(p) : ''}</div></button>))}</div></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Fecha de celebración</label><input type="date" className="input" {...inp('contract_date')} max={today} /></div>
            <div><label className="label">Apartado (si existe)</label><input type="number" min="0" step="0.01" className="input" {...inp('apartado')} placeholder="0.00" /></div>
            <div><label className="label">Fecha 1ª aportación</label><input type="date" className="input" {...inp('first_due_date')} /><div className="mt-1 text-[11px] muted">Vacío = un mes después del contrato</div></div>
            <div><label className="label">Día de pago acordado</label><input type="number" min="1" max="31" className="input" {...inp('pay_day')} placeholder="Del calendario" /></div>
            <div className="col-span-2"><label className="label">El apartado se aplica…</label><select className="input" {...inp('apartado_mode')}><option value="PRECIO">Como abono al precio total (reduce el saldo financiado)</option><option value="ENGANCHE">Como parte del enganche</option></select></div>
            <div className="col-span-2"><label className="label">Usuario responsable</label><select className="input" {...inp('responsible_user_id')}>{users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
            <div className="col-span-2"><label className="label">Observaciones</label><textarea className="input" rows={2} {...inp('notes')} /></div>
          </div>
        </section>
        {canException && <section className="card space-y-3 p-5">
          <label className="flex items-center gap-2"><input type="checkbox" checked={ex.on} onChange={(e) => setEx({ ...ex, on: e.target.checked })} /><h2>Condiciones especiales (excepción autorizada)</h2></label>
          {ex.on && <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Precio pactado</label><input type="number" step="0.01" className="input" value={ex.price_agreed} onChange={(e) => setEx({ ...ex, price_agreed: e.target.value })} placeholder={pv?.price} /></div>
            <div><label className="label">Enganche</label><input type="number" step="0.01" className="input" value={ex.enganche} onChange={(e) => setEx({ ...ex, enganche: e.target.value })} placeholder={pv?.enganche} /></div>
            <div><label className="label">No. aportaciones</label><input type="number" className="input" value={ex.n_installments} onChange={(e) => setEx({ ...ex, n_installments: e.target.value })} placeholder={pv?.n_installments} /></div>
            <div className="col-span-3"><label className="label">Motivo (queda registrado con su usuario)</label><input className="input" value={ex.reason} onChange={(e) => setEx({ ...ex, reason: e.target.value })} /></div></div>}
        </section>}
      </div>
      <div className="xl:col-span-3">
        <section className="card p-5 xl:sticky xl:top-6">
          <h2 className="mb-3">3. Resumen y calendario proyectado</h2>
          {!pv ? <p className="text-sm muted">Seleccione un terreno para calcular las condiciones.</p> : <>
            {pv.is_exception && <Alert kind="warning">Este contrato tiene condiciones distintas a la lista vigente y se registrará como excepción autorizada.</Alert>}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[['Precio pactado', m(pv.price)], ['Apartado', m(pv.apartado)], ['Enganche', m(pv.enganche)], ['Saldo financiado', m(pv.financed)], ['No. aportaciones', pv.n_installments],
                ['Importe de aportación', m(pv.installment_amount)], ['Última aportación', m(pv.last_installment)], ['Liquidación estimada', d(pv.est_end_date)]].map(([l, x]) => (
                <div key={l as string} className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] uppercase text-slate-500">{l}</div><div className="font-semibold tabular-nums">{x}</div></div>))}
            </div>
            <div className="max-h-[380px] overflow-auto rounded border border-slate-100"><table className="tbl"><thead><tr><th>Obligación</th><th>Vencimiento</th><th className="num">Importe</th></tr></thead>
              <tbody>{pv.schedule.map((s: any) => <tr key={s.kind + s.number}><td>{s.kind === 'MENSUAL' ? `Aportación ${s.number} de ${mens.length}` : s.kind === 'ENGANCHE' ? 'Enganche' : 'Apartado'}</td><td>{d(s.due_date)}</td><td className="num">{m(s.amount)}</td></tr>)}</tbody></table></div>
            <button className="btn-primary mt-4 w-full" disabled={!client || busy || (ex.on && ex.reason.trim().length < 5)} onClick={() => setConfirm(true)}>{client ? 'Guardar contrato' : 'Seleccione un cliente'}</button>
          </>}
        </section>
      </div>
      <Modal open={confirm} title="Confirmar contrato" onClose={() => setConfirm(false)}>
        <p className="text-sm">Se registrará el contrato de <b>{client?.full_name}</b> para el lote <b>{lot?.lot_key}</b> por <b>{m(pv?.price)}</b> con {pv?.n_installments} aportaciones. El terreno quedará como contratado y se generará el calendario.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setConfirm(false)}>Volver</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Confirmar'}</button></div>
      </Modal>
    </div>
  );
}
