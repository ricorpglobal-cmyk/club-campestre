import { api, fileResponse } from '@/lib/api';
import { getConfig } from '@/lib/config';
import { receiptPdf } from '@/lib/services/pdf';
import { audit } from '@/lib/audit';
import { pool } from '@/lib/db';
export const GET = api({ perm: 'aportaciones.ver' }, async ({ user, params, ip }) => {
  const cfg = await getConfig();
  const r = await receiptPdf(Number(params.id), cfg.nombre_proyecto, user, cfg.zona_horaria);
  await audit(pool(), user, 'EMISION_RECIBO', { entity: 'aportacion', entityId: params.id, ip });
  return fileResponse(r.buf, r.filename, 'application/pdf', true);
});
