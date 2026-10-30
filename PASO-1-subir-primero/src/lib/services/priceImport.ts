import type ExcelJS from 'exceljs';
import { q, one, tx } from '../db';
import { audit, AuditUser } from '../audit';
import { readUpload, cellText, cellNumber, normHeader, cellValue } from '../excel';
import { sha256 } from '../crypto';
import { badRequest, conflict, notFound } from '../errors';
import { lotKey, PRICE_FIELDS } from './lots';
import { toCents, fromCents } from '../money';

type Field = 'lot_number' | 'block' | 'street' | 'section' | 'area_m2' | 'cost_per_m2' | 'price_cash' | 'price_36' | 'down_36'
  | 'monthly_36' | 'price_48' | 'down_48' | 'monthly_48' | 'notes' | 'down_any' | 'lot_id';

export const FIELD_LABEL: Record<string, string> = {
  lot_id: 'ID interno', lot_number: 'Lote', block: 'Manzana', street: 'Calle', section: 'Colonia / sección', area_m2: 'Superficie (m²)',
  cost_per_m2: 'Costo por m²', price_cash: 'Precio de contado', price_36: 'Precio 36 meses', down_36: 'Enganche 36',
  monthly_36: 'Pago mensual 36', price_48: 'Precio 48 meses', down_48: 'Enganche 48', monthly_48: 'Pago mensual 48', notes: 'Observaciones', down_any: 'Enganche',
};

/** Reconoce encabezados con variantes de redacción. El orden importa: reglas más específicas primero. */
function detectField(h: string): Field | null {
  const s = normHeader(h);
  const has36 = /\b36\b/.test(s), has48 = /\b48\b/.test(s);
  if (/^ID( INTERNO)?( TERRENO)?$/.test(s)) return 'lot_id';
  if (/ENGANCHE/.test(s)) return has36 ? 'down_36' : has48 ? 'down_48' : 'down_any';
  if (/(PAGO|APORTACION|MENSUALIDAD)/.test(s) && (has36 || has48)) return has36 ? 'monthly_36' : 'monthly_48';
  if (/FINANCIAD|PLAZO|CREDITO/.test(s) || ((has36 || has48) && /PRECIO/.test(s))) return has36 ? 'price_36' : has48 ? 'price_48' : null;
  if (/COSTO|PRECIO/.test(s) && /M2|METRO/.test(s)) return 'cost_per_m2';
  if (/CONTADO/.test(s)) return 'price_cash';
  if (/^(M2|MTS2|MTS|SUPERFICIE.*|AREA.*)$/.test(s)) return 'area_m2';
  if (/MANZANA|^MZA?\.?$/.test(s)) return 'block';
  if (/^(LOTE|NO\.? LOTE|NUM(ERO)?\.? (DE )?LOTE|TERRENO|NO\.? TERRENO)$/.test(s)) return 'lot_number';
  if (/^CALLE/.test(s)) return 'street';
  if (/COLONIA|SECCION|ETAPA/.test(s)) return 'section';
  if (/OBSERVACION|NOTAS?$/.test(s)) return 'notes';
  return null;
}

export type ParsedRow = {
  row: number; key: string; lot_number: string; block: string | null; street: string | null; section: string | null; notes: string | null;
  values: Partial<Record<(typeof PRICE_FIELDS)[number], string | null>>; highlighted: boolean;
};
type Issue = { row: number; lote?: string; level: 'ERROR' | 'ADVERTENCIA'; message: string };

export function parsePriceSheet(wb: ExcelJS.Workbook) {
  const ws = wb.worksheets.find((w) => w.state !== 'hidden') ?? wb.worksheets[0];
  if (!ws) throw badRequest('El archivo no contiene hojas.');
  // 1) localizar fila de encabezados (la primera con una columna "lote" en las primeras 30 filas)
  let headerRow = 0; let map: Record<number, Field> = {};
  for (let r = 1; r <= Math.min(30, ws.rowCount); r++) {
    const m: Record<number, Field> = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => { const f = detectField(cellText(cell.value)); if (f && !Object.values(m).includes(f)) m[col] = f; });
    if (Object.values(m).includes('lot_number') && Object.keys(m).length >= 2) { headerRow = r; map = m; break; }
  }
  if (!headerRow) throw badRequest('No se encontró la fila de encabezados. Debe existir una columna "LOTE" y al menos una columna de precio.');
  const headers: { col: number; header: string; field: Field | null }[] = [];
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => headers.push({ col, header: cellText(cell.value).replace(/\s+/g, ' '), field: map[col] ?? null }));
  const fields = new Set(Object.values(map));
  const issues: Issue[] = [];
  if (!fields.has('price_cash') && !fields.has('price_36') && !fields.has('price_48')) throw badRequest('No se detectó ninguna columna de precio (contado, 36 o 48 meses).');

  const col = (f: Field) => Number(Object.keys(map).find((k) => map[Number(k)] === f));
  const rows: ParsedRow[] = [];
  const lotCol = col('lot_number');
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const lotCell = row.getCell(lotCol);
    if (lotCell.isMerged) continue;                                       // títulos, totales y notas en celdas combinadas
    const lotRaw = cellValue(lotCell.value);
    const get = (f: Field) => (fields.has(f) ? row.getCell(col(f)).value : null);
    const nums: Record<string, number | null> = {};
    for (const f of ['area_m2', 'cost_per_m2', 'price_cash', 'price_36', 'down_36', 'monthly_36', 'price_48', 'down_48', 'monthly_48', 'down_any'] as Field[]) nums[f] = fields.has(f) ? cellNumber(get(f)) : null;
    const anyPrice = ['price_cash', 'price_36', 'price_48'].some((f) => nums[f] !== null);
    const lotStr = lotRaw === null ? '' : String(typeof lotRaw === 'number' ? lotRaw : lotRaw).trim();
    if (!lotStr && !anyPrice) continue;                                   // fila vacía
    if (lotStr && !anyPrice && !/\d/.test(lotStr)) continue;               // filas de totales / notas
    if (lotStr.split(/\s+/).length > 3) continue;                          // texto libre, no es un número de lote
    if (!lotStr) { issues.push({ row: r, level: 'ERROR', message: 'Fila con precios pero sin número de lote.' }); continue; }
    if (typeof lotRaw === 'number' && !Number.isInteger(lotRaw)) { issues.push({ row: r, lote: lotStr, level: 'ERROR', message: 'Número de lote con decimales.' }); continue; }
    const block = fields.has('block') ? cellText(get('block')) || null : null;
    const key = lotKey(lotStr, block);
    let bad = false;
    for (const [f, v] of Object.entries(nums)) {
      if (v !== null && (Number.isNaN(v) || v < 0)) { issues.push({ row: r, lote: key, level: 'ERROR', message: `${FIELD_LABEL[f]} inválido.` }); bad = true; }
    }
    if (!anyPrice) { issues.push({ row: r, lote: key, level: 'ERROR', message: 'Precio faltante.' }); bad = true; }
    if (bad) continue;
    if (nums.down_any !== null) { nums.down_36 ??= nums.down_any; nums.down_48 ??= nums.down_any; }
    // mensualidad: si la columna existe y viene vacía (fórmula sin valor calculado) se calcula (precio − enganche) / plazo
    for (const [p, d, m, n] of [['price_36', 'down_36', 'monthly_36', 36], ['price_48', 'down_48', 'monthly_48', 48]] as const) {
      if (nums[p] !== null && nums[m] === null) nums[m] = (nums[p]! - (nums[d] ?? 0)) / n;
      if (nums[p] !== null && nums[d] !== null && nums[d]! > nums[p]!) { issues.push({ row: r, lote: key, level: 'ERROR', message: `Enganche mayor al precio a ${n} meses.` }); bad = true; }
    }
    if (bad) continue;
    if (fields.has('price_cash') && nums.price_cash === null) issues.push({ row: r, lote: key, level: 'ADVERTENCIA', message: 'Sin precio de contado.' });
    if (fields.has('price_36') && nums.price_36 === null) issues.push({ row: r, lote: key, level: 'ADVERTENCIA', message: 'Sin precio a 36 meses.' });
    if (fields.has('price_48') && nums.price_48 === null) issues.push({ row: r, lote: key, level: 'ADVERTENCIA', message: 'Sin precio a 48 meses.' });
    if (nums.area_m2 !== null && nums.area_m2 <= 0) issues.push({ row: r, lote: key, level: 'ADVERTENCIA', message: 'Superficie en cero.' });
    // celda de lote resaltada con un color distinto al del resto de la fila
    const fillOf = (c: ExcelJS.Cell) => (c.fill as any)?.fgColor?.argb ?? null;
    const lf = fillOf(row.getCell(lotCol)); const nf = fillOf(row.getCell(lotCol === 1 ? 2 : 1));
    const values: ParsedRow['values'] = {};
    for (const f of PRICE_FIELDS) values[f] = nums[f] === null ? null : fromCents(toCents(nums[f]));
    rows.push({
      row: r, key, lot_number: lotStr.toUpperCase(), block: block?.toUpperCase() ?? null,
      street: fields.has('street') ? cellText(get('street')) || null : null,
      section: fields.has('section') ? cellText(get('section')) || null : null,
      notes: fields.has('notes') ? cellText(get('notes')) || null : null,
      values, highlighted: !!lf && lf !== nf,
    });
  }
  // duplicados dentro del archivo
  const seen = new Map<string, number[]>();
  rows.forEach((r) => seen.set(r.key, [...(seen.get(r.key) ?? []), r.row]));
  const dupKeys = new Set([...seen.entries()].filter(([, v]) => v.length > 1).map(([k]) => k));
  for (const k of dupKeys) issues.push({ row: seen.get(k)![0], lote: k, level: 'ERROR', message: `Lote duplicado en el archivo (filas ${seen.get(k)!.join(', ')}). Se omiten todas sus filas.` });
  // nota de lotes resaltados
  let highlightNote: string | null = null;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const t = cellText(ws.getRow(r).getCell(1).value);
    if (/resaltad/i.test(t)) highlightNote = t;
  }
  const valid = rows.filter((r) => !dupKeys.has(r.key));
  return { sheet: ws.name, headerRow, headers, fields: [...fields], rows: valid, issues, highlightNote, totalDataRows: rows.length };
}

const fieldList = PRICE_FIELDS as readonly string[];

async function buildDiff(rows: ParsedRow[], fields: string[]) {
  const existing = await q<any>('SELECT * FROM lots');
  const byKey = new Map(existing.map((l) => [l.lot_key, l]));
  const changes: any[] = [];
  for (const r of rows) {
    const cur = byKey.get(r.key);
    if (!cur) { changes.push({ type: 'NUEVO', key: r.key, row: r.row, new: r.values }); continue; }
    const diff: Record<string, { old: string | null; new: string | null }> = {};
    for (const f of fieldList) {
      if (!fields.includes(f) && !(f.startsWith('down_') && fields.includes('down_any')) && !(f.startsWith('monthly_') && fields.includes(f.replace('monthly', 'price')))) continue;
      const o = cur[f] === null ? null : fromCents(toCents(cur[f])); const n = r.values[f as keyof ParsedRow['values']] ?? null;
      if (o !== n) diff[f] = { old: o, new: n };
    }
    changes.push(Object.keys(diff).length ? { type: 'ACTUALIZAR', key: r.key, row: r.row, lot_id: cur.id, diff } : { type: 'SIN_CAMBIO', key: r.key, row: r.row, lot_id: cur.id });
  }
  const inFile = new Set(rows.map((r) => r.key));
  const notIncluded = existing.filter((l) => !inFile.has(l.lot_key)).map((l) => l.lot_key);
  return { changes, notIncluded };
}

export async function previewPriceImport(buf: Buffer, filename: string, user: AuditUser) {
  if (buf.length > 10 * 1024 * 1024) throw badRequest('El archivo excede 10 MB.');
  let wb;
  try { wb = await readUpload(buf, filename); } catch (e: any) { throw badRequest(e.message || 'No se pudo leer el archivo.'); }
  const parsed = parsePriceSheet(wb);
  const { changes, notIncluded } = await buildDiff(parsed.rows, parsed.fields);
  const summary = {
    filas_validas: parsed.rows.length,
    nuevos: changes.filter((c) => c.type === 'NUEVO').length,
    actualizados: changes.filter((c) => c.type === 'ACTUALIZAR').length,
    sin_cambio: changes.filter((c) => c.type === 'SIN_CAMBIO').length,
    errores: parsed.issues.filter((i) => i.level === 'ERROR').length,
    advertencias: parsed.issues.filter((i) => i.level === 'ADVERTENCIA').length,
    no_incluidos: notIncluded.length,
    resaltados: parsed.rows.filter((r) => r.highlighted).length,
  };
  const rec = await one<{ id: number }>(
    `INSERT INTO price_imports(filename, file_sha256, user_id, status, column_map, payload, summary, errors)
     VALUES ($1,$2,$3,'VISTA_PREVIA',$4,$5,$6,$7) RETURNING id`,
    [filename, sha256(buf), user!.id, JSON.stringify(parsed.headers), JSON.stringify({ rows: parsed.rows, fields: parsed.fields, highlightNote: parsed.highlightNote }),
     JSON.stringify(summary), JSON.stringify(parsed.issues)]);
  return { importId: rec!.id, sheet: parsed.sheet, headerRow: parsed.headerRow, headers: parsed.headers, summary, issues: parsed.issues, changes, notIncluded, highlightNote: parsed.highlightNote };
}

export async function applyPriceImport(importId: number, opts: { markHighlighted: boolean }, user: AuditUser, ip: string | null) {
  return tx(async (c) => {
    const imp = await one<any>('SELECT * FROM price_imports WHERE id=$1 FOR UPDATE', [importId], c);
    if (!imp) throw notFound('Importación no encontrada.');
    if (imp.status !== 'VISTA_PREVIA') throw conflict('Esta importación ya fue aplicada o cancelada.');
    await q('LOCK TABLE lots IN SHARE ROW EXCLUSIVE MODE', [], c);
    const rows: ParsedRow[] = imp.payload.rows; const fields: string[] = imp.payload.fields;
    const { changes } = await buildDiff(rows, fields);   // se recalcula contra el estado actual
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const note = 'Lote resaltado en la lista de precios: precio actualizado conforme a la lista vigente.';
    let created = 0, updated = 0;
    for (const ch of changes) {
      const r = byKey.get(ch.key)!;
      const notes = r.notes ?? (opts.markHighlighted && r.highlighted ? note : null);
      if (ch.type === 'NUEVO') {
        const v = r.values;
        const ins = await one<{ id: number }>(`INSERT INTO lots(lot_key, lot_number, block, street, section, area_m2, cost_per_m2, price_cash, price_36, down_36, monthly_36, price_48, down_48, monthly_48, notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
          [r.key, r.lot_number, r.block, r.street, r.section, v.area_m2, v.cost_per_m2, v.price_cash, v.price_36, v.down_36, v.monthly_36, v.price_48, v.down_48, v.monthly_48, notes], c);
        await q('INSERT INTO lot_price_history(lot_id, changed_by, import_id, old_values, new_values) VALUES ($1,$2,$3,NULL,$4)', [ins!.id, user!.id, importId, JSON.stringify(v)], c);
        created++;
      } else if (ch.type === 'ACTUALIZAR') {
        const sets: string[] = []; const p: unknown[] = [ch.lot_id];
        const oldV: Record<string, unknown> = {}; const newV: Record<string, unknown> = {};
        for (const [f, d] of Object.entries<any>(ch.diff)) { p.push(d.new); sets.push(`${f}=$${p.length}`); oldV[f] = d.old; newV[f] = d.new; }
        if (notes) { p.push(notes); sets.push(`notes = coalesce(notes, $${p.length})`); }
        // Sólo se tocan columnas del catálogo; contratos y pagos conservan sus propios importes pactados.
        await q(`UPDATE lots SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, p, c);
        await q('INSERT INTO lot_price_history(lot_id, changed_by, import_id, old_values, new_values) VALUES ($1,$2,$3,$4,$5)', [ch.lot_id, user!.id, importId, JSON.stringify(oldV), JSON.stringify(newV)], c);
        updated++;
      } else if (notes && opts.markHighlighted) {
        await q('UPDATE lots SET notes = coalesce(notes, $2) WHERE id=$1', [ch.lot_id, notes], c);
      }
    }
    const summary = { ...imp.summary, aplicados_nuevos: created, aplicados_actualizados: updated };
    await q(`UPDATE price_imports SET status='APLICADA', applied_at=now(), summary=$2 WHERE id=$1`, [importId, JSON.stringify(summary)], c);
    await audit(c, user, 'IMPORTACION_PRECIOS', { entity: 'importacion_precios', entityId: importId, after: { archivo: imp.filename, nuevos: created, actualizados: updated }, ip });
    return { created, updated, summary };
  });
}

export async function cancelPriceImport(importId: number, user: AuditUser) {
  const r = await one<any>(`UPDATE price_imports SET status='CANCELADA' WHERE id=$1 AND status='VISTA_PREVIA' AND user_id=$2 RETURNING id`, [importId, user!.id]);
  if (!r) throw conflict('La importación no está pendiente o no le pertenece.');
}

export async function listPriceImports() {
  return q<any>(`SELECT pi.id, pi.filename, pi.created_at, pi.applied_at, pi.status, pi.summary, u.username FROM price_imports pi JOIN users u ON u.id=pi.user_id ORDER BY pi.id DESC LIMIT 50`);
}

export async function priceImportReport(importId: number) {
  const imp = await one<any>('SELECT pi.*, u.username FROM price_imports pi JOIN users u ON u.id=pi.user_id WHERE pi.id=$1', [importId]);
  if (!imp) throw notFound();
  return imp;
}
