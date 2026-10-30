import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { contractSummary, PLAN_LABEL } from '@/lib/services/contracts';
import { CONCEPT_LABEL, METHOD_LABEL } from '@/lib/services/payments';
import { q } from '@/lib/db';
import { PageHeader, Section, KV, StatusBadge, Empty, mx } from '@/components/ui';
import { mxn } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { DocUpload } from '@/components/DocUpload';
import { ContractActions, CancelPaymentButton } from './Actions';

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage('contratos.ver');
  const id = Number((await params).id);
  const s = await contractSummary(id);
  const k = s.contract; const t = s.totals;
  const docs = await q<any>(`SELECT d.id, d.doc_type, d.original_name, d.size_bytes, d.uploaded_at, u.username FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.contract_id=$1 AND d.archived_at IS NULL ORDER BY d.uploaded_at DESC`, [id]);
  const audit = await q<any>(`SELECT at, username, action, reason FROM audit_log WHERE (entity='contrato' AND entity_id=$1) OR (entity='aportacion' AND entity_id IN (SELECT id::text FROM payments WHERE contract_id=$2)) ORDER BY at DESC LIMIT 40`, [String(id), id]);
  const canPay = u.perms.has('aportaciones.registrar') && !['CANCELADO', 'LIQUIDADO'].includes(k.status);
  return (
    <>
      <PageHeader title={`Contrato ${k.contract_number}`} subtitle={<>{k.client_name} · Lote {k.lot_key} · {PLAN_LABEL[k.plan]} · <StatusBadge s={k.status} /> <StatusBadge s={s.status} /></>} actions={<>
        <Link href="/contratos" className="btn-secondary">Volver</Link>
        {u.perms.has('estados.ver') && <Link href={`/estados-cuenta/${k.id}`} className="btn-secondary">Estado de cuenta</Link>}
        {canPay && <Link href={`/aportaciones/nueva?contract=${k.id}`} className="btn-primary">Registrar aportación</Link>}</>} />
      {k.status === 'CANCELADO' && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Contrato cancelado el {fmtDateTime(k.cancelled_at)} por {k.cancelled_by_name}. Motivo: {k.cancel_reason}</div>}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[['Precio pactado', mx(t.price)], ['Total recibido', mx(t.total_received)], ['Capital pendiente', mx(t.capital_pending)], ['Importe vencido', mx(t.overdue_amount)],
          ['Aportaciones cubiertas', `${t.n_covered} de ${t.n_scheduled}`], ['Próximo pago', t.next_due ? `${fmtDate(t.next_due)} · ${mx(t.next_amount)}` : '—']].map(([l, v]) => (
          <div key={l} className="card card-pad"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}</div><div className={`mt-1 font-semibold tabular-nums ${l === 'Importe vencido' && t.overdue_amount ? 'text-red-700' : ''}`}>{v}</div></div>))}
      </div>
      <Section title="Condiciones pactadas">
        <KV items={[['Cliente', <Link key="c" href={`/clientes/${k.client_id}`}>{k.client_name}</Link>], ['Terreno', <Link key="l" href={`/terrenos/${k.lot_id}`}>{k.lot_key}</Link>], ['Fecha de celebración', fmtDate(k.contract_date)], ['Plan', PLAN_LABEL[k.plan]],
          ['Precio pactado', mxn(k.price_agreed)], ['Apartado', `${mxn(k.apartado)} (${k.apartado_mode === 'PRECIO' ? 'abono al precio' : 'parte del enganche'})`], ['Enganche', mxn(k.enganche)], ['Saldo financiado', mxn(k.financed)],
          ['Número de aportaciones', k.n_installments], ['Importe de aportación', mxn(k.installment_amount)], ['Primera aportación', fmtDate(k.first_due_date)], ['Día de pago', k.pay_day],
          ['Liquidación estimada', fmtDate(k.est_end_date)], ['Responsable', k.responsible], ['Origen', k.source === 'IMPORTACION' ? 'Importado' : 'Captura'], ['Observaciones', k.notes]]} />
        {k.is_exception && <p className="mt-4 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">Condición especial autorizada por <b>{k.exception_by}</b>: {k.exception_reason}</p>}
        <p className="mt-3 text-xs muted">Lista vigente al contratar ({k.list_snapshot?.plan}): precio {k.list_snapshot?.price ? mxn(k.list_snapshot.price) : '—'}, enganche {k.list_snapshot?.down ? mxn(k.list_snapshot.down) : '—'}.</p>
      </Section>
      <ContractActions id={k.id} status={k.status} notes={k.notes} canCancel={u.perms.has('contratos.cancelar')} canEdit={u.perms.has('contratos.editar')} />
      <Section title="Calendario de aportaciones" pad={false}>
        <div className="max-h-[520px] overflow-auto"><table className="tbl"><thead className="sticky top-0"><tr><th>Obligación</th><th>Vencimiento</th><th className="num">Programado</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Fecha real de pago</th><th className="num">Días de atraso</th><th>Estatus</th></tr></thead>
          <tbody>{s.states.map((x) => <tr key={x.id} className={x.overdue ? 'bg-red-50/40' : ''}><td>{x.kind === 'MENSUAL' ? `Aportación ${x.number}` : x.kind === 'ENGANCHE' ? 'Enganche' : 'Apartado'}</td><td>{fmtDate(x.due_date)}</td>
            <td className="num">{mx(x.amount)}</td><td className="num">{mx(x.paid)}</td><td className="num">{mx(x.balance)}</td><td>{fmtDate(x.paid_date)}</td><td className="num">{x.days_late || ''}</td><td><StatusBadge s={x.overdue && x.status === 'PARCIAL' ? 'PARCIAL' : x.status} />{x.overdue && x.status === 'PARCIAL' && <span className="ml-1 text-[10px] text-red-700">vencida</span>}</td></tr>)}</tbody></table></div>
      </Section>
      <Section title="Aportaciones registradas" pad={false}>
        {s.payments.length ? <table className="tbl"><thead><tr><th>Fecha efectiva</th><th>Recibo</th><th>Concepto</th><th className="num">Capital</th><th className="num">Interés</th><th className="num">Total</th><th>Forma</th><th>Referencia</th><th>Registró</th><th>Estatus</th><th /></tr></thead>
          <tbody>{s.payments.map((p: any) => <tr key={p.id} className={p.status === 'CANCELADA' ? 'opacity-60' : ''}><td>{fmtDate(p.effective_date)}</td><td>{p.receipt_number}</td><td>{CONCEPT_LABEL[p.concept]}</td>
            <td className="num">{mxn(p.capital)}</td><td className="num">{mxn(p.interest)}</td><td className="num font-medium">{mxn(p.total)}</td><td>{METHOD_LABEL[p.method]}</td><td className="text-xs">{p.reference}</td><td className="text-xs">{p.username}</td><td><StatusBadge s={p.status} /></td>
            <td className="whitespace-nowrap"><a className="btn-ghost btn-sm" href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer">Recibo</a>
              {p.status === 'CONFIRMADA' && u.perms.has('aportaciones.cancelar') && <CancelPaymentButton id={p.id} receipt={p.receipt_number} />}</td></tr>)}</tbody></table> : <Empty>Sin aportaciones.</Empty>}
      </Section>
      <Section title="Documentos contractuales">
        {docs.length > 0 && <ul className="mb-4 divide-y divide-slate-100 text-sm">{docs.map((d) => <li key={d.id} className="flex items-center justify-between py-2"><span>{d.original_name} <span className="muted">({Math.round(d.size_bytes / 1024)} KB · {fmtDateTime(d.uploaded_at)} · {d.username})</span></span><a className="btn-ghost btn-sm" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">Ver</a></li>)}</ul>}
        {(u.perms.has('contratos.editar') || u.perms.has('contratos.crear')) && k.status !== 'CANCELADO' ? <DocUpload url={`/api/contracts/${k.id}/documents`} types={[['CONTRATO', 'Contrato firmado'], ['IDENTIFICACION', 'Identificación'], ['OTRO', 'Otro']]} /> : !docs.length && <p className="text-sm muted">Sin documentos.</p>}
      </Section>
      <Section title="Historial de auditoría" pad={false}>
        {audit.length ? <table className="tbl"><tbody>{audit.map((a, i) => <tr key={i}><td className="whitespace-nowrap text-xs">{fmtDateTime(a.at)}</td><td className="text-xs">{a.username}</td><td className="text-xs">{a.action.replace(/_/g, ' ').toLowerCase()}</td><td className="text-xs muted">{a.reason}</td></tr>)}</tbody></table> : <Empty>Sin registros.</Empty>}
      </Section>
    </>
  );
}
