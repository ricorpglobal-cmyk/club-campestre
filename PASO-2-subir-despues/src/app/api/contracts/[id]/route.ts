import { z } from 'zod';
import { api } from '@/lib/api';
import { updateContractMeta } from '@/lib/services/contracts';
export const PATCH = api({ perm: 'contratos.editar' }, async ({ req, user, params, ip }) => {
  const b = z.object({ notes: z.string().max(2000).nullable().optional(), responsible_user_id: z.number().int().positive().nullable().optional(), en_revision: z.boolean().optional() }).parse(await req.json());
  await updateContractMeta(Number(params.id), b, user, ip); return { ok: true };
});
