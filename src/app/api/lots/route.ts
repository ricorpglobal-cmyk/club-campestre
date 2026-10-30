import { api } from '@/lib/api';
import { listLots } from '@/lib/services/lots';
export const GET = api({ perm: 'terrenos.ver' }, async ({ req }) => {
  const s = new URL(req.url).searchParams;
  return { lots: await listLots({ q: s.get('q') ?? undefined, status: s.get('status') ?? undefined }) };
});
