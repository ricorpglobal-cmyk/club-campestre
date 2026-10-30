import { requirePage } from '@/lib/session';
import { PageHeader, Section } from '@/components/ui';
import { ClientForm } from '../ClientForm';
export default async function NewClient() {
  const u = await requirePage('clientes.editar');
  return <><PageHeader title="Nuevo cliente" /><Section title="Datos del cliente"><ClientForm canFiscal={u.perms.has('clientes.fiscal')} /></Section></>;
}
