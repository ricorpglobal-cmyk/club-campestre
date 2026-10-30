import { api } from '@/lib/api';
import { updateUser } from '@/lib/services/users';
export const PATCH = api({ perm: 'usuarios.administrar' }, async ({ req, user, params, ip }) => { await updateUser(Number(params.id), await req.json(), user, ip); return { ok: true }; });
