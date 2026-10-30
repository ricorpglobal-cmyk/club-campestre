import ExcelJS from 'exceljs';
import { api, fileResponse } from '@/lib/api';
import { getConfig } from '@/lib/config';
import { statementPdf } from '@/lib/services/pdf';
import { contractSummary } from '@/lib/services/contracts';
import { buildStatementSheets } from '@/lib/services/reports';
import { audit } from '@/lib/audit';
import { pool } from '@/lib/db';
import { fmtDateTime, todayISO } from '@/lib/dates';
export const GET = api({ perm: 'estados.ver' }, async ({ req, user, params, ip }) => {
  const cfg = await getConfig(); const id = Number(params.id);
  const format = new URL(req.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'pdf';
  let out: { buf: Buffer; filename: string; mime: string };
  if (format === 'pdf') { const r = await statementPdf(id, cfg.nombre_proyecto, user, cfg.zona_horaria); out = { ...r, mime: 'application/pdf' }; }
  else {
    const s = await contractSummary(id); const wb = new ExcelJS.Workbook();
    buildStatementSheets(wb, s, cfg.nombre_proyecto, `Generado: ${fmtDateTime(new Date(), cfg.zona_horaria)} por ${user.full_name}`);
    out = { buf: Buffer.from(await wb.xlsx.writeBuffer()), filename: `Estado_Cuenta_${s.contract.contract_number}_${todayISO(cfg.zona_horaria)}.xlsx`, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  await audit(pool(), user, 'EXPORTACION', { entity: 'estado_cuenta', entityId: id, after: { formato: format, archivo: out.filename }, ip });
  return fileResponse(out.buf, out.filename, out.mime);
});
