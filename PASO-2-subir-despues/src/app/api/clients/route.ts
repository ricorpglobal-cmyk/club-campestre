import { api } from '@/lib/api';
import { createClient, searchClients } from '@/lib/services/clients';
import { tx } from '@/lib/db';
export const GET = api({ perm: 'clientes.ver' }, async ({ req, user }) => ({ clients: await searchClients(new URL(req.url).searchParams.get('q') ?? undefined, user.perms.has('clientes.fiscal'), 30) }));
export const POST = api({ perm: 'clientes.editar' }, async ({ req, user, ip }) => {
  const body = await req.json();
  return { client: await tx((c) => createClient(c, body, user, ip, user.perms.has('clientes.fiscal'))) };
});
