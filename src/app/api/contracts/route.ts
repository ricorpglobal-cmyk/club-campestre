import { api } from '@/lib/api';
import { createContract, listContracts } from '@/lib/services/contracts';
export const GET = api({ perm: 'contratos.ver' }, async ({ req }) => ({ contracts: (await listContracts({ q: new URL(req.url).searchParams.get('q') ?? undefined })).slice(0, 30) }));
export const POST = api({ perm: 'contratos.crear' }, async ({ req, user, ip }) => ({ contract: await createContract(await req.json(), user as any, ip) }));
