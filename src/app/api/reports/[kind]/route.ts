import { api, fileResponse } from '@/lib/api';
import { buildReport } from '@/lib/services/reports';
import { isISODate } from '@/lib/dates';
export const GET = api({ perm: 'reportes.exportar' }, async ({ req, user, params, ip }) => {
  const s = new URL(req.url).searchParams; const g = (k: string) => s.get(k)?.trim() || undefined;
  const d = (k: string) => (isISODate(g(k)) ? g(k) : undefined);
  const n = (k: string) => (g(k) && Number.isInteger(Number(g(k))) ? Number(g(k)) : undefined);
  const r = await buildReport(params.kind, { day: d('day'), month: g('month')?.match(/^\d{4}-\d{2}$/)?.[0], year: g('year')?.match(/^\d{4}$/)?.[0], from: d('from'), to: d('to'),
    client_id: n('client'), lot: g('lot'), contract: g('contract'), contract_id: n('contract_id'), status: g('status'), method: g('method'), user_id: n('user') }, user, ip);
  return fileResponse(r.buf, r.filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
