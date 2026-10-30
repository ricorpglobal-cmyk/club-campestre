import ExcelJS from 'exceljs';

/** Valor "plano" de una celda de ExcelJS: resultado de fórmulas, texto enriquecido, hipervínculos. */
export function cellValue(v: any): any {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('formula' in v || 'sharedFormula' in v) return null;
    if ('richText' in v) return v.richText.map((t: any) => t.text).join('');
    if ('text' in v) return v.text;
    if ('error' in v) return null;
  }
  return v;
}
export function cellText(v: any): string {
  const x = cellValue(v);
  if (x === null || x === undefined) return '';
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  return String(x).trim();
}
export function normHeader(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/²/g, '2').toUpperCase().replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function cellNumber(v: any): number | null {
  const x = cellValue(v);
  if (x === null || x === undefined || x === '') return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : NaN;
  const s = String(x).replace(/[$,\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export async function loadWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return wb;
}

/** Convierte CSV simple (coma o punto y coma) a una hoja de ExcelJS. */
export function csvToWorkbook(text: string): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('CSV');
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (const line of lines) {
    if (!line.trim()) { ws.addRow([]); continue; }
    const out: string[] = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
      else if (ch === '"') inQ = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    ws.addRow(out.map((s) => { const t = s.trim(); const n = Number(t.replace(/[$,]/g, '')); return t !== '' && /^[-$\d.,\s]+$/.test(t) && Number.isFinite(n) ? n : t; }));
  }
  return wb;
}

export async function readUpload(buf: Buffer, filename: string): Promise<ExcelJS.Workbook> {
  if (/\.csv$/i.test(filename)) return csvToWorkbook(buf.toString('utf8'));
  if (!/\.xlsx$/i.test(filename)) throw new Error('Formato no admitido. Use .xlsx o .csv');
  // .xlsx es un ZIP: firma PK
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('El archivo no es un Excel .xlsx válido.');
  return loadWorkbook(buf);
}

// ---------- Estilos de exportación ----------
export const MONEY_FMT = '"$"#,##0.00';
export const DATE_FMT = 'dd/mm/yyyy';

export type ColDef = { header: string; key: string; width?: number; type?: 'money' | 'date' | 'int' | 'text' };

export function addTableSheet(wb: ExcelJS.Workbook, name: string, title: string, subtitle: string[], cols: ColDef[], rows: Record<string, any>[], totals?: string[]) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 + subtitle.length }] });
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: 'FF1B3328' } };
  for (const s of subtitle) ws.addRow([s]).font = { size: 10, color: { argb: 'FF555555' } };
  ws.addRow([]);
  const hr = ws.addRow(cols.map((c) => c.header));
  hr.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244335' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  const headerRow = hr.number;
  for (const r of rows) {
    const row = ws.addRow(cols.map((c) => {
      const v = r[c.key];
      if (c.type === 'money') return v === null || v === undefined || v === '' ? null : Number(v);
      if (c.type === 'date') { if (!v) return null; const s = String(v).slice(0, 10); const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
      return v ?? '';
    }));
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.type === 'money') cell.numFmt = MONEY_FMT;
      if (c.type === 'date') cell.numFmt = DATE_FMT;
    });
  }
  if (totals && rows.length) {
    const tr = ws.addRow(cols.map((c, i) => {
      if (i === 0) return 'TOTAL';
      if (totals.includes(c.key)) {
        const L = ws.getColumn(i + 1).letter;
        return { formula: `SUBTOTAL(9,${L}${headerRow + 1}:${L}${headerRow + rows.length})`, result: rows.reduce((a, r) => a + Number(r[c.key] || 0), 0) };
      }
      return '';
    }));
    tr.font = { bold: true };
    cols.forEach((c, i) => { if (c.type === 'money') tr.getCell(i + 1).numFmt = MONEY_FMT; });
    tr.eachCell((c) => { c.border = { top: { style: 'thin' } }; });
  }
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? (c.type === 'money' ? 16 : c.type === 'date' ? 12 : 18); });
  if (rows.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + rows.length, column: cols.length } };
  return ws;
}
