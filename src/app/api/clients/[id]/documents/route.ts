import { api, need } from '@/lib/api';
import { badRequest } from '@/lib/errors';
import { uploadDocument } from '@/lib/services/clients';
export const POST = api({ perm: 'clientes.editar' }, async ({ req, user, params, ip }) => {
  need(user, 'clientes.fiscal');
  const form = await req.formData(); const f = form.get('file');
  if (!f || typeof f === 'string') throw badRequest('Seleccione un archivo.');
  return uploadDocument({ clientId: Number(params.id), docType: String(form.get('doc_type') || 'OTRO'), filename: f.name, buf: Buffer.from(await f.arrayBuffer()) }, user, ip);
});
