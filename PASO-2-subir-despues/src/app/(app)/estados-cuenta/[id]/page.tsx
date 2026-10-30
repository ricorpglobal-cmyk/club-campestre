import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { contractSummary, PLAN_LABEL } from '@/lib/services/contracts';
import { CONCEPT_LABEL, METHOD_LABEL } from '@/lib/services/payments';
import { getConfig } from '@/lib/config';
import { PageHeader, Section, KV, StatusBadge, mx, Empty } from '@/components/ui';
import { mxn } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { PrintButton } from '@/components/PrintButton';

export default async function Statement({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage('estados.ver');
  const s = await contractSummary(Number((await params).id)); const cfg = await getConfig();
  const k = s.contract; const t = s.totals;
  const ok = s.payments.filter((p: any) => p.status === 'CONFIRMADA');
  return (
    <>
      <PageHeader title="Estado de cuenta" subtitle={`${cfg.nombre_proyecto} · Generado el ${fmtDateTime(new Date(), cfg.zona_horaria)} por ${u.full_name}`} actions={<>
        <Link href={`/contratos/${k.id}`} className="btn-secondary">Ver contrato</Link><PrintButton />
        <a className="btn-secondary" href={`/api/statements/${k.id}?format=pdf`}>Descargar PDF</a><a className="btn-primary" href={`/api/statements/${k.id}?format=xlsx`}>Descargar Excel</a></>} />
      <Section title="Datos generales"><KV items={[['Cliente', k.client_name], ['Número de contrato', k.contract_number], ['Número de terreno', k.lot_key], ['Fecha de contrato', fmtDate(k.contract_date)],
        ['Precio pactado', mxn(k.price_agreed)], ['Plan de financiamiento', PLAN_LABEL[k.plan]], ['Estatus', <StatusBadge key="s" s={s.status} />], ['Próxima fecha de pago', t.next_due ? fmtDate(t.next_due) : '—']]} /></Section>
      <Section title="Resumen financiero"><KV items={[['Precio total', mx(t.price)], ['Apartado registrado', mx(t.apartado)], ['Enganche recibido', mx(t.enganche)], ['Aportaciones de capital recibidas', mx(t.aportaciones_capital)],
        ['Intereses efectivamente cobrados', mx(t.interest)], ['Total histórico recibido', mx(t.total_received)], ['Capital pendiente', mx(t.capital_pending)], ['Intereses pendientes', mx(t.interest_pending)],
        ['Total actualizado pendiente', mx(t.total_pending)], ['Aportaciones programadas', t.n_scheduled], ['Aportaciones cubiertas', t.n_covered], ['Pendientes / vencidas', `${t.n_pending} / ${t.n_overdue}`]]} /></Section>
      <Section title="Historial detallado" pad={false}>{ok.length ? <table className="tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th>Número de aportación</th><th className="num">Capital</th><th className="num">Interés</th><th className="num">Total recibido</th><th>Forma de pago</th><th>Referencia</th></tr></thead>
        <tbody>{ok.map((p: any) => <tr key={p.id}><td>{fmtDate(p.effective_date)}</td><td>{CONCEPT_LABEL[p.concept]}<div className="text-[10px] muted">{p.receipt_number}</div></td><td>{p.scheduled_number ?? ''}</td><td className="num">{mxn(p.capital)}</td><td className="num">{mxn(p.interest)}</td><td className="num font-medium">{mxn(p.total)}</td><td>{METHOD_LABEL[p.method]}</td><td className="text-xs">{p.reference}</td></tr>)}
          <tr className="bg-slate-50 font-semibold"><td colSpan={3}>Total</td><td className="num">{mx(t.total_received - t.interest)}</td><td className="num">{mx(t.interest)}</td><td className="num">{mx(t.total_received)}</td><td colSpan={2} /></tr></tbody></table> : <Empty>Sin operaciones confirmadas.</Empty>}</Section>
    </>
  );
}
