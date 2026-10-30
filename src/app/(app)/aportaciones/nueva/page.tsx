import { requirePage } from '@/lib/session';
import { getConfig } from '@/lib/config';
import { todayISO } from '@/lib/dates';
import { PageHeader } from '@/components/ui';
import { SP, int } from '@/lib/params';
import { contractSummary } from '@/lib/services/contracts';
import { fromCents } from '@/lib/money';
import { PaymentForm } from './PaymentForm';

export default async function NewPayment({ searchParams }: { searchParams: SP }) {
  await requirePage('aportaciones.registrar');
  const sp = await searchParams; const cfg = await getConfig();
  let pre = null;
  if (int(sp.contract)) { const s = await contractSummary(int(sp.contract)!); pre = { id: s.contract.id, contract_number: s.contract.contract_number, client_name: s.contract.client_name, lot_key: s.contract.lot_key, status: s.contract.status, pending: fromCents(s.totals.capital_pending), next: s.states.find((x) => x.balance > 0 && !x.override) ?? null }; }
  return <><PageHeader title="Registrar aportación" subtitle="Sólo registre dinero efectivamente recibido. La distribución sobre el calendario se muestra antes de guardar." /><PaymentForm today={todayISO(cfg.zona_horaria)} pre={pre} moratorios={cfg.moratorios_activos} /></>;
}
