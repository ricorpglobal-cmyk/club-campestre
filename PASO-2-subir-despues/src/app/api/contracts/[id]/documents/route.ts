import { api } from '@/lib/api';
import { badRequest } from '@/lib/errors';
import { uploadDocument } from '@/lib/services/clients';
export const POST = api({ perm: ['contratos.editar', 'contratos.crear'] }, async ({ req, user, params, ip }) => {
  const form = await req.formData(); const f = form.get('file');
  if (!f || typeof f === 'string') throw badRequest('Seleccione un archivo.');
  return uploadDocument({ contractId: Number(params.id), docType: String(form.get('doc_type') || 'CONTRATO'), filename: f.name, buf: Buffer.from(await f.arrayBuffer()) }, user, ip);
});
