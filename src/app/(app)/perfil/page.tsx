import { requirePage } from '@/lib/session';
import { listSessions } from '@/lib/services/users';
import { one } from '@/lib/db';
import { PageHeader, Section, KV } from '@/components/ui';
import { ROLE_LABEL, PERMISSIONS } from '@/lib/permissions';
import { fmtDateTime } from '@/lib/dates';
import { Profile } from './Profile';

export default async function ProfilePage() {
  const u = await requirePage();
  const r = await one<any>('SELECT last_login_at, password_changed_at FROM users WHERE id=$1', [u.id]);
  const sessions = await listSessions(u.id);
  return (
    <>
      <PageHeader title="Mi perfil" />
      <Section title="Cuenta"><KV items={[['Usuario', u.username], ['Nombre', u.full_name], ['Rol', ROLE_LABEL[u.role]], ['Correo', u.email], ['Último acceso', fmtDateTime(r.last_login_at)], ['Contraseña cambiada', fmtDateTime(r.password_changed_at)]]} />
        <div className="mt-4 text-xs muted">Permisos: {[...u.perms].map((p) => PERMISSIONS[p]).join(' · ')}</div></Section>
      <Profile sessions={JSON.parse(JSON.stringify(sessions))} current={u.sessionId} />
    </>
  );
}
