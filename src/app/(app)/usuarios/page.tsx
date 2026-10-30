import { requirePage } from '@/lib/session';
import { listUsers, listSessions } from '@/lib/services/users';
import { PERMISSIONS, ROLE_PERMS, ROLE_LABEL, ADMIN_ONLY } from '@/lib/permissions';
import { PageHeader } from '@/components/ui';
import { UsersAdmin } from './UsersAdmin';

export default async function Users() {
  const u = await requirePage('usuarios.administrar');
  const users = await listUsers(); const sessions = await listSessions();
  return (
    <>
      <PageHeader title="Usuarios" subtitle={`${users.filter((x) => x.is_active).length} de 10 cuentas activas permitidas`} />
      <UsersAdmin users={JSON.parse(JSON.stringify(users))} sessions={JSON.parse(JSON.stringify(sessions))} me={u.id} perms={PERMISSIONS} rolePerms={ROLE_PERMS} roleLabel={ROLE_LABEL} adminOnly={ADMIN_ONLY} />
    </>
  );
}
