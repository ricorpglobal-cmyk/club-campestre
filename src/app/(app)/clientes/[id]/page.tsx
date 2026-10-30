import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { getClient } from '@/lib/services/clients';
import { listContracts, contractSummary, PLAN_LABEL } from '@/lib/services/contracts';
import { listPayments, CONCEPT_LABEL, METHOD_LABEL } from '@/lib/services/payments';
import { PageHeader, Section, KV, StatusBadge, Empty, mx } from '@/components/ui';
import { mxn } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { ClientForm } from '../ClientForm';
import { DocUpload } from '@/components/DocUpload';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage('clientes.ver');
  const id = Number((await params).id); const fiscal = u.perms.has('clientes.fiscal');
  const { client: c, docs, history } = await getClient(id, fiscal);
  const contracts = u.perms.has('contratos.ver') ? await listContracts({ client_id: id }) : [];
  const summaries = await Promise.all(contracts.map((k) => contractSummary(k.id)));
  const pays = u.perms.has('aportaciones.ver') ? (await listPayments({ client_id: id, limit: 500 })) : [];
  const addr = [c.street, c.ext_no && `#${c.ext_no}`, c.int_no && `int. ${c.int_no}`, c.colony, c.municipality, c.state, c.zip && `C.P. ${c.zip}`].filter(Boolean).join(', ');
  return (
    <>
      <PageHeader title={c.full_name} subtitle={`${c.code} · Alta ${fmtDate(String(c.created_at.toISOString?.() ?? c.created_at).slice(0, 10))}${c.created_by_name ? ` por ${c.created_by_name}` : ''}`} actions={<>
        <Link href="/clientes" className="btn-secondary">Volver</Link>
        {u.perms.has('contratos.crear') && <Link href={`/contratos/nuevo?client=${c.id}`} className="btn-primary">Nuevo contrato</Link>}</>} />
      <Section title="Expediente">
        <KV items={[['Teléfono', c.phone], ['Teléfono adicional', c.phone2], ['Correo', c.email], ['Domicilio', addr || null], ...(fiscal ? [['RFC', c.rfc], ['Constancia fiscal', <StatusBadge key="f" s={c.fiscal_doc_status} />], ['Recepción', fmtDate(c.fiscal_doc_received_at) || null], ['Notas fiscales', c.fiscal_notes]] as [string, any][] : []), ['Observaciones', c.notes]]} />
      </Section>
      <Section title="Contratos y saldos" pad={false}>
        {contracts.length ? <table className="tbl"><thead><tr><th>Contrato</th><th>Terreno</th><th>Fecha</th><th>Plan</th><th className="num">Precio pactado</th><th className="num">Pagado (capital)</th><th className="num">Saldo pendiente</th><th>Próximo pago</th><th>Cobranza</th><th /></tr></thead>
          <tbody>{summaries.map((s) => { const k = s.contract; return <tr key={k.id}><td><Link href={`/contratos/${k.id}`}>{k.contract_number}</Link></td><td>{k.lot_key}</td><td>{fmtDate(k.contract_date)}</td><td>{PLAN_LABEL[k.plan]}</td>
            <td className="num">{mxn(k.price_agreed)}</td><td className="num">{mx(s.totals.price - s.totals.capital_pending)}</td><td className="num font-medium">{mx(s.totals.capital_pending)}</td>
            <td>{s.totals.next_due ? `${fmtDate(s.totals.next_due)} · ${mx(s.totals.next_amount)}` : '—'}</td><td><StatusBadge s={s.status} /></td>
            <td>{u.perms.has('estados.ver') && <Link className="btn-ghost btn-sm" href={`/estados-cuenta/${k.id}`}>Estado de cuenta</Link>}</td></tr>; })}</tbody></table> : <Empty>Sin contratos.</Empty>}
      </Section>
      {u.perms.has('aportaciones.ver') && <Section title="Historial de aportaciones" pad={false}>
        {pays.length ? <div className="max-h-96 overflow-auto"><table className="tbl"><thead><tr><th>Fecha</th><th>Recibo</th><th>Contrato</th><th>Concepto</th><th className="num">Total</th><th>Forma</th><th>Estatus</th></tr></thead>
          <tbody>{pays.map((p) => <tr key={p.id} className={p.status === 'CANCELADA' ? 'opacity-60' : ''}><td>{fmtDate(p.effective_date)}</td><td>{p.receipt_number}</td><td>{p.contract_number}</td><td>{CONCEPT_LABEL[p.concept]}</td><td className="num">{mxn(p.total)}</td><td>{METHOD_LABEL[p.method]}</td><td><StatusBadge s={p.status} /></td></tr>)}</tbody></table></div> : <Empty>Sin aportaciones.</Empty>}
      </Section>}
      {fiscal && <Section title="Documentos (acceso restringido)">
        {docs.length > 0 && <ul className="mb-4 divide-y divide-slate-100 text-sm">{docs.map((d) => <li key={d.id} className="flex items-center justify-between py-2">
          <span><b>{d.doc_type.replace('_', ' ').toLowerCase()}</b> · {d.original_name} <span className="muted">({Math.round(d.size_bytes / 1024)} KB · {fmtDateTime(d.uploaded_at)} · {d.username})</span></span>
          <a className="btn-ghost btn-sm" href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">Ver</a></li>)}</ul>}
        {u.perms.has('clientes.editar') && <DocUpload url={`/api/clients/${c.id}/documents`} types={[['CONSTANCIA_FISCAL', 'Constancia de Situación Fiscal'], ['IDENTIFICACION', 'Identificación'], ['OTRO', 'Otro']]} />}
      </Section>}
      {u.perms.has('clientes.editar') && <Section title="Editar datos"><ClientForm initial={{ ...c, fiscal_doc_received_at: c.fiscal_doc_received_at ?? '' }} canFiscal={fiscal} /></Section>}
      <Section title="Historial de modificaciones" pad={false}>
        {history.length ? <table className="tbl"><tbody>{history.map((h, i) => <tr key={i}><td className="whitespace-nowrap text-xs">{fmtDateTime(h.at)}</td><td className="text-xs">{h.username}</td><td className="text-xs">{h.action.replace(/_/g, ' ').toLowerCase()}</td>
          <td className="text-xs muted">{h.after ? Object.entries(h.after).map(([k, v]) => `${k}: ${v ?? '—'}`).join(' · ') : ''}</td></tr>)}</tbody></table> : <Empty>Sin modificaciones.</Empty>}
      </Section>
    </>
  );
}
