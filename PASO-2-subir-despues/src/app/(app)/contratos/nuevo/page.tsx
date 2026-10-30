import { requirePage } from '@/lib/session';
import { q } from '@/lib/db';
import { getConfig } from '@/lib/config';
import { todayISO } from '@/lib/dates';
import { PageHeader } from '@/components/ui';
import { SP, int } from '@/lib/params';
import { ContractForm } from './ContractForm';

export default async function NewContract({ searchParams }: { searchParams: SP }) {
  const u = await requirePage('contratos.crear');
  const sp = await searchParams; const cfg = await getConfig();
  const lots = await q<any>(`SELECT id, lot_key, area_m2, price_cash, price_36, down_36, monthly_36, price_48, down_48, monthly_48, status FROM lots WHERE status IN ('DISPONIBLE','APARTADO')
    ORDER BY coalesce(block,''), CASE WHEN lot_number ~ '^\\d+$' THEN lot_number::int END NULLS LAST, lot_number`);
  const users = await q<any>('SELECT id, full_name FROM users WHERE is_active ORDER BY full_name');
  const pre = int(sp.client) ? (await q<any>('SELECT id, full_name, code, phone FROM clients WHERE id=$1', [int(sp.client)]))[0] ?? null : null;
  return (
    <>
      <PageHeader title="Nuevo contrato" subtitle="Las condiciones se toman de la lista de precios vigente. Revise el calendario proyectado antes de guardar." />
      <ContractForm lots={lots} users={users} today={todayISO(cfg.zona_horaria)} defaultMode={cfg.modo_apartado} canException={u.perms.has('contratos.excepcion') && cfg.permitir_excepciones}
        preLot={int(sp.lot) ?? null} preClient={pre} me={u.id} />
    </>
  );
}
