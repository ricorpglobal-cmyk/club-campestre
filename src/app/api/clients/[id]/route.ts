import { api } from '@/lib/api';
import { updateClient, redact } from '@/lib/services/clients';
export const PATCH = api({ perm: 'clientes.editar' }, async ({ req, user, params, ip }) => {
  const c = await updateClient(Number(params.id), await req.json(), user, ip, user.perms.has('clientes.fiscal'));
  return { client: redact(c, user.perms.has('clientes.fiscal')) };
});
