import ExcelJS from 'exceljs';
import { api, fileResponse } from '@/lib/api';
import { priceImportReport } from '@/lib/services/priceImport';
import { addTableSheet } from '@/lib/excel';
import { fmtDateTime } from '@/lib/dates';
export const GET = api({ perm: 'precios.importar' }, async ({ params }) => {
  const imp = await priceImportReport(Number(params.id));
  const wb = new ExcelJS.Workbook();
  const sub = [`Archivo: ${imp.filename}`, `Importó: ${imp.username} · ${fmtDateTime(imp.created_at)} · Estatus: ${imp.status}`];
  addTableSheet(wb, 'Resumen', 'RESULTADO DE IMPORTACIÓN DE LISTA DE PRECIOS', sub, [{ header: 'Concepto', key: 'k', width: 30 }, { header: 'Valor', key: 'v', width: 14 }],
    Object.entries(imp.summary ?? {}).map(([k, v]) => ({ k: k.replace(/_/g, ' '), v })));
  addTableSheet(wb, 'Errores y advertencias', 'ERRORES Y ADVERTENCIAS', sub, [{ header: 'Fila', key: 'row', width: 8 }, { header: 'Lote', key: 'lote', width: 12 }, { header: 'Nivel', key: 'level', width: 14 }, { header: 'Mensaje', key: 'message', width: 70 }], imp.errors ?? []);
  return fileResponse(Buffer.from(await wb.xlsx.writeBuffer()), `Importacion_Precios_${imp.id}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});
