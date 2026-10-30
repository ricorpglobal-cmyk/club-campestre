import { z } from 'zod';
import { api } from '@/lib/api';
import { setLotStatusManual, updateLotInfo } from '@/lib/services/lots';
export const PATCH = api({ perm: 'terrenos.editar' }, async ({ req, user, params, ip }) => {
  const b = z.object({ status: z.enum(['DISPONIBLE', 'APARTADO', 'SUSPENDIDO', 'CANCELADO', 'CONTRATADO', 'LIQUIDADO']).optional(), reason: z.string().max(500).optional(),
    info: z.object({ street: z.string().max(200).nullable().optional(), section: z.string().max(200).nullable().optional(), notes: z.string().max(2000).nullable().optional() }).optional() }).parse(await req.json());
  const id = Number(params.id);
  if (b.status) await setLotStatusManual(id, b.status, b.reason ?? '', user, ip);
  if (b.info) await updateLotInfo(id, { street: b.info.street || null, section: b.info.section || null, notes: b.info.notes || null }, user, ip);
  return { ok: true };
});
