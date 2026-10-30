import { z } from 'zod';
import { api } from '@/lib/api';
import { cancelPayment } from '@/lib/services/payments';
export const POST = api({ perm: 'aportaciones.cancelar' }, async ({ req, user, params, ip }) => {
  const b = z.object({ reason: z.string().max(1000) }).parse(await req.json());
  await cancelPayment(Number(params.id), b.reason, user, ip); return { ok: true };
});
