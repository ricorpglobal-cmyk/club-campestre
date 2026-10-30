import Link from 'next/link';
import { requirePage } from '@/lib/session';
import { getLot, LOT_STATUS_LABEL, PRICE_FIELDS } from '@/lib/services/lots';
import { FIELD_LABEL } from '@/lib/services/priceImport';
import { PLAN_LABEL } from '@/lib/services/contracts';
import { PageHeader, Section, KV, StatusBadge, Empty } from '@/components/ui';
import { mxn } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { LotAdmin } from './LotAdmin';

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage('terrenos.ver');
  const { lot, contracts, history } = await getLot(Number((await params).id));
  const active = contracts.find((c) => c.status !== 'CANCELADO');
  const m = (v: any) => (v === null || v === undefined ? '—' : mxn(v));
  return (
    <>
      <PageHeader title={`Terreno ${lot.lot_key}`} subtitle={<>ID interno {lot.id} · Actualizado {fmtDateTime(lot.updated_at)}</>} actions={<>
        <Link href="/terrenos" className="btn-secondary">Volver</Link>
        {!active && ['DISPONIBLE', 'APARTADO'].includes(lot.status) && u.perms.has('contratos.crear') && <Link href={`/contratos/nuevo?lot=${lot.id}`} className="btn-primary">Contratar este terreno</Link>}</>} />
      <Section title="Datos del terreno">
        <KV items={[['Lote', lot.lot_number], ['Manzana', lot.block], ['Calle', lot.street], ['Colonia / sección', lot.section], ['Superficie', lot.area_m2 ? `${Number(lot.area_m2)} m²` : null],
          ['Costo por m² (informativo)', m(lot.cost_per_m2)], ['Estatus comercial', <StatusBadge key="s" s={lot.status} />], ['Observaciones', lot.notes]]} />
      </Section>
      <Section title="Precios vigentes (lista de precios)">
        <KV items={[['Precio de contado', m(lot.price_cash)], ['Precio 36 meses', m(lot.price_36)], ['Enganche 36', m(lot.down_36)], ['Pago mensual 36', m(lot.monthly_36)],
          ['', ''], ['Precio 48 meses', m(lot.price_48)], ['Enganche 48', m(lot.down_48)], ['Pago mensual 48', m(lot.monthly_48)]]} />
        <p className="mt-3 text-xs muted">Los contratos conservan el precio pactado al momento de su firma; los cambios en la lista no los modifican.</p>
      </Section>
      {u.perms.has('terrenos.editar') && <LotAdmin lot={{ id: lot.id, status: lot.status, street: lot.street, section: lot.section, notes: lot.notes }} hasActive={!!active} />}
      <Section title="Historial de contratos" pad={false}>
        {contracts.length ? <table className="tbl"><thead><tr><th>Contrato</th><th>Fecha</th><th>Cliente</th><th>Plan</th><th className="num">Precio pactado</th><th>Estatus</th></tr></thead>
          <tbody>{contracts.map((c) => <tr key={c.id}><td><Link href={`/contratos/${c.id}`}>{c.contract_number}</Link></td><td>{fmtDate(c.contract_date)}</td><td>{c.client_name}</td><td>{PLAN_LABEL[c.plan]}</td><td className="num">{mxn(c.price_agreed)}</td><td><StatusBadge s={c.status} /></td></tr>)}</tbody></table>
          : <Empty>Sin contratos.</Empty>}
      </Section>
      <Section title="Historial de precios" pad={false}>
        {history.length ? <table className="tbl"><thead><tr><th>Fecha</th><th>Usuario</th><th>Importación</th><th>Cambios</th></tr></thead>
          <tbody>{history.map((h) => <tr key={h.id}><td className="whitespace-nowrap">{fmtDateTime(h.changed_at)}</td><td>{h.username}</td><td>{h.import_id ? `#${h.import_id}` : ''}</td>
            <td className="text-xs">{h.old_values ? Object.keys(h.new_values).map((k) => <div key={k}>{FIELD_LABEL[k] ?? k}: <span className="muted line-through">{h.old_values[k] ? mxn(h.old_values[k]) : '—'}</span> → <b>{h.new_values[k] ? mxn(h.new_values[k]) : '—'}</b></div>) : 'Alta inicial en catálogo'}</td></tr>)}</tbody></table>
          : <Empty>Sin cambios registrados.</Empty>}
      </Section>
    </>
  );
}
