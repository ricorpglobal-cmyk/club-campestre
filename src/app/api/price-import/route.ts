import { api } from '@/lib/api';
import { badRequest } from '@/lib/errors';
import { previewPriceImport } from '@/lib/services/priceImport';
export const POST = api({ perm: 'precios.importar' }, async ({ req, user }) => {
  const form = await req.formData(); const f = form.get('file');
  if (!f || typeof f === 'string') throw badRequest('Seleccione un archivo .xlsx o .csv');
  return previewPriceImport(Buffer.from(await f.arrayBuffer()), f.name, user);
});
