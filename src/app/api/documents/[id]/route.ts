import { api, fileResponse } from '@/lib/api';
import { one } from '@/lib/db';
import { forbidden, notFound } from '@/lib/errors';
import { readDocument } from '@/lib/services/clients';
/** Los documentos nunca son públicos: sólo se entregan a usuarios con permiso, y cada consulta queda auditada. */
export const GET = api({}, async ({ user, params, ip }) => {
  if (!/^[0-9a-f-]{36}$/.test(params.id)) throw notFound();
  const meta = await one<any>('SELECT client_id, contract_id, doc_type FROM documents WHERE id=$1', [params.id]);
  if (!meta) throw notFound('Documento no encontrado.');
  const ok = meta.client_id ? user.perms.has('clientes.fiscal') : user.perms.has('contratos.ver');
  if (!ok) throw forbidden('No tiene permiso para consultar este documento.');
  const { doc, buf } = await readDocument(params.id, user, ip);
  return fileResponse(buf, doc.original_name, doc.mime_type, true);
});
