import { api } from '@/lib/api';
import { badRequest } from '@/lib/errors';
import { previewContractImport } from '@/lib/services/contractImport';
export const POST = api({ perm: 'contratos.importar' }, async ({ req, user }) => {
  const form = await req.formData(); const f = form.get('file');
  if (!f || typeof f === 'string') throw badRequest('Seleccione un archivo .xlsx');
  return previewContractImport(Buffer.from(await f.arrayBuffer()), f.name, user);
});
