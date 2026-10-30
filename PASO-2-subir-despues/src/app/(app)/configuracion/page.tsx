import { requirePage } from '@/lib/session';
import { getConfig } from '@/lib/config';
import { PageHeader } from '@/components/ui';
import { mailConfigured } from '@/lib/mail';
import { ConfigForm } from './ConfigForm';

export default async function Config() {
  await requirePage('config.editar');
  const cfg = await getConfig();
  return (
    <>
      <PageHeader title="Configuración del sistema" subtitle="Los cambios aplican a operaciones nuevas; los contratos ya registrados conservan sus condiciones." />
      <ConfigForm cfg={cfg} env={{ storage: process.env.STORAGE_DRIVER || 'local', mail: mailConfigured(), appUrl: process.env.APP_URL || '' }} />
    </>
  );
}
