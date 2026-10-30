import { z } from 'zod';
import { api } from '@/lib/api';
import { cancelContract } from '@/lib/services/contracts';
export const POST = api({ perm: 'contratos.cancelar' }, async ({ req, user, params, ip }) => {
  const b = z.object({ reason: z.string().max(1000) }).parse(await req.json());
  await cancelContract(Number(params.id), b.reason, user, ip); return { ok: true };
});
