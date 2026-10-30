import { api } from '@/lib/api';
import { adminResetLink } from '@/lib/services/users';
export const POST = api({ perm: 'usuarios.administrar' }, async ({ req, user, params, ip }) => adminResetLink(Number(params.id), user, ip, process.env.APP_URL || new URL(req.url).origin));
