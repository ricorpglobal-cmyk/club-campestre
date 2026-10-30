import { api } from '@/lib/api';
import { createUser, listUsers } from '@/lib/services/users';
export const GET = api({ perm: 'usuarios.administrar' }, async () => ({ users: await listUsers() }));
export const POST = api({ perm: 'usuarios.administrar' }, async ({ req, user, ip }) => createUser(await req.json(), user, ip));
