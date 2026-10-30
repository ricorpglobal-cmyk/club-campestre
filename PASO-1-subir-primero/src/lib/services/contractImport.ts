/**
 * Importación de contratos y pagos históricos desde Excel (plantilla del sistema).
 * Valida todo, muestra vista previa y aplica en UNA transacción: o entra todo o no entra nada.
 */
import ExcelJS from 'exceljs';
import { q, one, tx } from '../db';
import { audit, AuditUser } from '../audit';
import { readUpload, cellText, cellNumber, normHeader, cellValue, MONEY_FMT, DATE_FMT } from '../excel';
import { sha256 } from '../crypto';
import { badRequest, conflict, notFound } from '../errors';
import { parseFlexibleDate, todayISO, addMonthsOnDay } from '../dates';
import { toCents, fromCents } from '../money';
import { getConfig } from '../config';
import { lotKey, syncLotStatus } from './lots';
import { createContract } from './contracts';
import { registerPayment, CONCEPTS, METHODS } from './payments';
import { createClient } from './clients';
import { recomputeContract } from './ledger';

const C_COLS = [
  ['NUMERO_CONTRATO', 'Número de contrato (único)', true], ['FECHA_CONTRATO', 'Fecha de celebración (DD/MM/AAAA)', true], ['LOTE', 'Número de lote', true],
  ['MANZANA', 'Manzana (sólo si la lista la usa)', false], ['PLAN', 'CONTADO, 36, 48 u OTRO', true], ['PRECIO_PACTADO', 'Precio pactado en el contrato', true],
  ['APARTADO', 'Importe del apartado (0 si no hubo)', false], ['ENGANCHE', 'Enganche pactado', true], ['NUM_APORTACIONES', 'Número de aportaciones mensuales', true],
  ['FECHA_PRIMERA_APORTACION', 'Vencimiento de la aportación 1 (DD/MM/AAAA)', false], ['DIA_PAGO', 'Día de pago acordado (1-31)', false],
  ['ESTATUS', 'ACTIVO, CANCELADO o EN_REVISION (LIQUIDADO se calcula solo)', false], ['CLIENTE_NOMBRE', 'Nombre completo del cliente', true],
  ['TELEFONO', '', false], ['TELEFONO_2', '', false], ['CORREO', '', false], ['CALLE', '', false], ['NUM_EXT', '', false], ['NUM_INT', '', false], ['COLONIA', '', false],
  ['MUNICIPIO', '', false], ['ESTADO', '', false], ['CP', 'Código postal (5 dígitos)', false], ['RFC', '', false], ['OBSERVACIONES', '', false],
] as const;
const P_COLS = [
  ['NUMERO_CONTRATO', 'Debe existir en la hoja Contratos o en el sistema', true], ['FECHA_PAGO', 'Fecha efectiva de recepción (DD/MM/AAAA)', true],
  ['CONCEPTO', CONCEPTS.join(', '), true], ['CAPITAL', 'Importe de capital', false], ['INTERES', 'Interés cobrado (si aplica)', false],
  ['FORMA_PAGO', METHODS.join(', '), true], ['REFERENCIA', 'Referencia bancaria', false], ['NUMERO_RECIBO', 'Folio de recibo original (opcional, único)', false],
  ['NUM_APORTACION', 'Número de aportación (informativo)', false], ['OBSERVACIONES', '', false],
] as const;

export async function contractTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ins = wb.addWorksheet('Instrucciones');
  const lines = [
    'PLANTILLA DE CARGA DE CONTRATOS Y PAGOS HISTÓRICOS',
    '',
    '1. Capture un contrato por fila en la hoja "Contratos" y cada pago recibido en la hoja "Pagos".',
    '2. No cambie los nombres de las columnas. Las columnas marcadas con * son obligatorias.',
    '3. Fechas en formato DD/MM/AAAA (o como fecha de Excel). Importes sin signo de pesos o con él; se aceptan ambos.',
    '4. El LOTE debe existir en el catálogo de terrenos (cargue antes la lista de precios).',
    '5. Si un cliente tiene varios contratos, escriba su nombre igual (y el mismo RFC o teléfono) para que se registre una sola vez.',
    '6. PRECIO_PACTADO, ENGANCHE y NUM_APORTACIONES deben ser los del contrato firmado; el sistema genera el calendario con ellos.',
    '7. En "Pagos", APARTADO y ENGANCHE se capturan como conceptos propios; las mensualidades con concepto MENSUAL.',
    '8. El sistema valida todo y muestra una vista previa. Nada se guarda hasta que usted confirma; si algo falla, no se carga nada.',
  ];
  lines.forEach((l, i) => { const r = ins.addRow([l]); if (i === 0) r.font = { bold: true, size: 13 }; });
  ins.getColumn(1).width = 120;
  const mk = (name: string, cols: readonly (readonly [string, string, boolean])[], sample: any[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const h = ws.addRow(cols.map(([c, , req]) => (req ? `${c}*` : c)));
    h.eachCell((c, i) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244335' } }; const note = cols[i - 1][1]; if (note) c.note = note; });
    cols.forEach((_, i) => { ws.getColumn(i + 1).width = 18; });
    for (const s of sample) ws.addRow(s);
    return ws;
  };
  mk('Contratos', C_COLS, []);
  mk('Pagos', P_COLS, []);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type Issue = { sheet: string; row: number; level: 'ERROR' | 'ADVERTENCIA'; message: string };

function readSheet(ws: ExcelJS.Worksheet | undefined, cols: readonly (readonly [string, string, boolean])[], issues: Issue[], sheetName: string) {
  if (!ws) { issues.push({ sheet: sheetName, row: 0, level: 'ERROR', message: `Falta la hoja "${sheetName}".` }); return []; }
  const map = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, i) => map.set(normHeader(cellText(c.value)).replace(/\*$/, '').replace(/\s+/g, '_'), i));
  for (const [c, , req] of cols) if (req && !map.has(c)) issues.push({ sheet: sheetName, row: 1, level: 'ERROR', message: `Falta la columna obligatoria ${c}.` });
  const out: { row: number; v: Record<string, any> }[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r); const v: Record<string, any> = {}; let any = false;
    for (const [c] of cols) { const i = map.get(c); const x = i ? cellValue(row.getCell(i).value) : null; v[c] = x; if (x !== null && String(x).trim() !== '') any = true; }
    if (any) out.push({ row: r, v });
  }
  return out;
}

async function validateFile(wb: ExcelJS.Workbook) {
  const issues: Issue[] = [];
  const cfg = await getConfig();
  const today = todayISO(cfg.zona_horaria);
  const cRows = readSheet(wb.getWorksheet('Contratos'), C_COLS, issues, 'Contratos');
  const pRows = readSheet(wb.getWorksheet('Pagos'), P_COLS, issues, 'Pagos');
  const lots = new Map((await q<any>('SELECT id, lot_key, status FROM lots')).map((l) => [l.lot_key, l]));
  const activeLots = new Map((await q<any>(`SELECT k.lot_id, k.contract_number FROM contracts k WHERE status<>'CANCELADO'`)).map((r) => [r.lot_id, r.contract_number]));
  const dbContracts = new Map((await q<any>('SELECT id, upper(contract_number) n, price_agreed, status FROM contracts')).map((r) => [r.n, r]));
  const dbReceipts = new Set((await q<any>('SELECT upper(receipt_number) n FROM payments')).map((r) => r.n));
  const contracts: any[] = []; const seenNum = new Map<string, number>(); const seenLot = new Map<number, number>();
  const err = (sheet: string, row: number, message: string) => issues.push({ sheet, row, level: 'ERROR', message });
  const warn = (sheet: string, row: number, message: string) => issues.push({ sheet, row, level: 'ADVERTENCIA', message });
  for (const { row, v } of cRows) {
    const e0 = issues.length;
    const num = cellText(v.NUMERO_CONTRATO); const N = num.toUpperCase();
    if (!num) err('Contratos', row, 'Falta NUMERO_CONTRATO.');
    else if (seenNum.has(N)) err('Contratos', row, `Contrato ${num} repetido (fila ${seenNum.get(N)}).`);
    else if (dbContracts.has(N)) err('Contratos', row, `El contrato ${num} ya existe en el sistema.`);
    seenNum.set(N, row);
    const date = parseFlexibleDate(v.FECHA_CONTRATO); if (!date) err('Contratos', row, 'FECHA_CONTRATO inválida.'); else if (date > today) err('Contratos', row, 'FECHA_CONTRATO posterior a hoy.');
    const key = v.LOTE === null ? '' : lotKey(cellText(v.LOTE), cellText(v.MANZANA) || null);
    const lot = lots.get(key); if (!key) err('Contratos', row, 'Falta LOTE.'); else if (!lot) err('Contratos', row, `El lote ${key} no existe en el catálogo.`);
    const plan = cellText(v.PLAN).toUpperCase().replace(/\s*MESES?/, '');
    if (!['CONTADO', '36', '48', 'OTRO'].includes(plan)) err('Contratos', row, 'PLAN debe ser CONTADO, 36, 48 u OTRO.');
    const status = (cellText(v.ESTATUS).toUpperCase().replace(/\s+/g, '_') || 'ACTIVO');
    if (!['ACTIVO', 'CANCELADO', 'EN_REVISION', 'LIQUIDADO'].includes(status)) err('Contratos', row, 'ESTATUS inválido.');
    const money = (f: string, req: boolean) => { const n = cellNumber(v[f]); if (n === null) { if (req) err('Contratos', row, `Falta ${f}.`); return 0; } if (Number.isNaN(n) || n < 0) { err('Contratos', row, `${f} inválido o negativo.`); return 0; } return toCents(n); };
    const price = money('PRECIO_PACTADO', true); const apartado = money('APARTADO', false); const enganche = money('ENGANCHE', true);
    const n = cellNumber(v.NUM_APORTACIONES);
    if (n === null || Number.isNaN(n) || n < 0 || !Number.isInteger(n)) err('Contratos', row, 'NUM_APORTACIONES debe ser un entero ≥ 0.');
    if (price <= 0) err('Contratos', row, 'PRECIO_PACTADO debe ser mayor a cero.');
    const financed = price - enganche - (cfg.modo_apartado === 'PRECIO' ? apartado : 0);
    if (financed < 0) err('Contratos', row, 'Enganche y apartado superan el precio.');
    if (financed > 0 && n === 0) err('Contratos', row, 'Hay saldo financiado pero NUM_APORTACIONES es 0.');
    const first = v.FECHA_PRIMERA_APORTACION ? parseFlexibleDate(v.FECHA_PRIMERA_APORTACION) : null;
    if (v.FECHA_PRIMERA_APORTACION && !first) err('Contratos', row, 'FECHA_PRIMERA_APORTACION inválida.');
    const payDay = cellNumber(v.DIA_PAGO); if (payDay !== null && (Number.isNaN(payDay) || payDay < 1 || payDay > 31)) err('Contratos', row, 'DIA_PAGO debe estar entre 1 y 31.');
    const name = cellText(v.CLIENTE_NOMBRE); if (name.length < 3) err('Contratos', row, 'Falta CLIENTE_NOMBRE.');
    const rfc = cellText(v.RFC).toUpperCase() || null; if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) err('Contratos', row, 'RFC con formato inválido.');
    const cp = cellText(v.CP) || null; if (cp && !/^\d{5}$/.test(cp)) err('Contratos', row, 'CP debe tener 5 dígitos.');
    const correo = cellText(v.CORREO) || null; if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) err('Contratos', row, 'CORREO inválido.');
    if (lot && status !== 'CANCELADO') {
      if (activeLots.has(lot.id)) err('Contratos', row, `El lote ${key} ya tiene el contrato vigente ${activeLots.get(lot.id)} en el sistema.`);
      else if (seenLot.has(lot.id)) err('Contratos', row, `El lote ${key} aparece en dos contratos vigentes del archivo (fila ${seenLot.get(lot.id)}).`);
      seenLot.set(lot.id, row);
      if (['SUSPENDIDO', 'CANCELADO'].includes(lot.status)) warn('Contratos', row, `El lote ${key} está ${lot.status.toLowerCase()} en el catálogo; quedará como contratado.`);
    }
    if (issues.length > e0 && issues.slice(e0).some((i) => i.level === 'ERROR')) continue;
    contracts.push({ row, number: num, date, lot_id: lot.id, lot_key: key, plan, price, apartado, enganche, n: n ?? 0, first: first ?? (financed > 0 ? addMonthsOnDay(date!, plan === 'CONTADO' ? 0 : 1, payDay ?? undefined) : null),
      pay_day: payDay, status: status === 'LIQUIDADO' ? 'ACTIVO' : status, declared_liquidated: status === 'LIQUIDADO', notes: cellText(v.OBSERVACIONES) || null,
      client: { full_name: name, phone: cellText(v.TELEFONO) || null, phone2: cellText(v.TELEFONO_2) || null, email: correo, street: cellText(v.CALLE) || null, ext_no: cellText(v.NUM_EXT) || null,
        int_no: cellText(v.NUM_INT) || null, colony: cellText(v.COLONIA) || null, municipality: cellText(v.MUNICIPIO) || null, state: cellText(v.ESTADO) || null, zip: cp, rfc } });
  }
  const byNum = new Map(contracts.map((c) => [c.number.toUpperCase(), c]));
  const capByContract = new Map<string, number>(); const seenRec = new Set<string>();
  const payments: any[] = [];
  for (const { row, v } of pRows) {
    const e0 = issues.length;
    const N = cellText(v.NUMERO_CONTRATO).toUpperCase();
    const fileC = byNum.get(N); const dbC = dbContracts.get(N);
    if (!N) err('Pagos', row, 'Falta NUMERO_CONTRATO.');
    else if (!fileC && !dbC) err('Pagos', row, `El contrato ${N} no está en la hoja Contratos (o tiene errores) ni en el sistema.`);
    const date = parseFlexibleDate(v.FECHA_PAGO); if (!date) err('Pagos', row, 'FECHA_PAGO inválida.'); else if (date > today) err('Pagos', row, 'FECHA_PAGO posterior a hoy: un pago programado no se registra como recibido.');
    const concept = normHeader(cellText(v.CONCEPTO)).replace(/\s+/g, '_').replace('APORTACION_MENSUAL', 'MENSUAL').replace('ABONO_EXTRAORDINARIO', 'EXTRAORDINARIO').replace('INTERES_MORATORIO', 'MORATORIO').replace('AJUSTE_AUTORIZADO', 'AJUSTE');
    if (!(CONCEPTS as readonly string[]).includes(concept)) err('Pagos', row, `CONCEPTO inválido (${CONCEPTS.join(', ')}).`);
    const method = normHeader(cellText(v.FORMA_PAGO)).replace('TRANSFERENCIA BANCARIA', 'TRANSFERENCIA');
    if (!(METHODS as readonly string[]).includes(method)) err('Pagos', row, `FORMA_PAGO inválida (${METHODS.join(', ')}).`);
    const cap = cellNumber(v.CAPITAL); const int = cellNumber(v.INTERES);
    if ((cap !== null && (Number.isNaN(cap) || cap < 0)) || (int !== null && (Number.isNaN(int) || int < 0))) err('Pagos', row, 'Importes inválidos o negativos.');
    const capital = toCents(cap ?? 0); const interest = toCents(int ?? 0);
    if (capital + interest <= 0) err('Pagos', row, 'El pago no tiene importe.');
    if (concept === 'MORATORIO' && capital > 0) err('Pagos', row, 'El interés moratorio va en INTERES, no en CAPITAL.');
    if (concept !== 'MORATORIO' && capital <= 0) err('Pagos', row, 'Falta CAPITAL.');
    const rec = cellText(v.NUMERO_RECIBO).toUpperCase() || null;
    if (rec && (dbReceipts.has(rec) || seenRec.has(rec))) err('Pagos', row, `El recibo ${rec} está repetido.`);
    if (rec) seenRec.add(rec);
    if (fileC && date && date < fileC.date) warn('Pagos', row, 'Pago anterior a la fecha del contrato.');
    if (issues.slice(e0).some((i) => i.level === 'ERROR')) continue;
    capByContract.set(N, (capByContract.get(N) ?? 0) + capital);
    payments.push({ row, contract: N, date, concept, capital, interest, method, reference: cellText(v.REFERENCIA) || null, receipt: rec, number: cellNumber(v.NUM_APORTACION), notes: cellText(v.OBSERVACIONES) || null });
  }
  for (const [N, cap] of capByContract) {
    const fc = byNum.get(N); const dc = dbContracts.get(N);
    const price = fc ? fc.price : toCents(dc.price_agreed);
    const prevPaid = dc ? toCents((await one<any>(`SELECT coalesce(sum(capital),0) s FROM payments WHERE contract_id=$1 AND status='CONFIRMADA'`, [dc.id]))!.s) : 0;
    if (cap + prevPaid > price) err('Pagos', 0, `Los pagos de capital del contrato ${N} (${fromCents(cap + prevPaid)}) exceden su precio (${fromCents(price)}).`);
  }
  for (const c of contracts) {
    const paid = capByContract.get(c.number.toUpperCase()) ?? 0;
    if (c.declared_liquidated && paid < c.price) warn('Contratos', c.row, `Marcado LIQUIDADO pero sus pagos suman ${fromCents(paid)} de ${fromCents(c.price)}; quedará ACTIVO con saldo.`);
  }
  // clientes: agrupar por RFC, o por nombre + teléfono
  const existing = await q<any>('SELECT id, upper(rfc) rfc, lower(full_name) name, regexp_replace(coalesce(phone,\'\'),\'\\D\',\'\',\'g\') phone FROM clients');
  const clientKey = (c: any) => c.rfc ? `RFC:${c.rfc}` : `N:${c.full_name.toLowerCase().replace(/\s+/g, ' ')}|${(c.phone ?? '').replace(/\D/g, '')}`;
  let newClients = 0; const seenClient = new Map<string, number | 'new'>();
  for (const c of contracts) {
    const k = clientKey(c.client);
    if (!seenClient.has(k)) {
      const ex = existing.find((e) => (c.client.rfc && e.rfc === c.client.rfc) || (!c.client.rfc && e.name === c.client.full_name.toLowerCase() && e.phone === (c.client.phone ?? '').replace(/\D/g, '')));
      seenClient.set(k, ex ? ex.id : 'new'); if (!ex) newClients++;
    }
    c.client_key = k; c.existing_client_id = seenClient.get(k) === 'new' ? null : seenClient.get(k);
  }
  return { contracts, payments, issues, newClients };
}

export async function previewContractImport(buf: Buffer, filename: string, user: AuditUser) {
  if (buf.length > 15 * 1024 * 1024) throw badRequest('El archivo excede 15 MB.');
  let wb; try { wb = await readUpload(buf, filename); } catch (e: any) { throw badRequest(e.message); }
  const v = await validateFile(wb);
  const errors = v.issues.filter((i) => i.level === 'ERROR').length;
  const summary = { contratos: v.contracts.length, pagos: v.payments.length, clientes_nuevos: v.newClients, errores: errors, advertencias: v.issues.length - errors,
    importe_contratado: fromCents(v.contracts.filter((c) => c.status !== 'CANCELADO').reduce((a, c) => a + c.price, 0)),
    capital_pagos: fromCents(v.payments.reduce((a, p) => a + p.capital, 0)), intereses_pagos: fromCents(v.payments.reduce((a, p) => a + p.interest, 0)) };
  const rec = await one<{ id: number }>(`INSERT INTO contract_imports(filename, file_sha256, user_id, status, payload, summary, errors) VALUES ($1,$2,$3,'VISTA_PREVIA',$4,$5,$6) RETURNING id`,
    [filename, sha256(buf), user!.id, JSON.stringify({ b64: buf.toString('base64') }), JSON.stringify(summary), JSON.stringify(v.issues)]);
  return { importId: rec!.id, summary, issues: v.issues, contracts: v.contracts.slice(0, 500).map((c) => ({ row: c.row, number: c.number, date: c.date, lot: c.lot_key, plan: c.plan, price: fromCents(c.price), enganche: fromCents(c.enganche), n: c.n, client: c.client.full_name, cliente_existente: !!c.existing_client_id, status: c.status })) };
}

export async function applyContractImport(importId: number, user: AuditUser, ip: string | null) {
  return tx(async (c) => {
    const imp = await one<any>('SELECT * FROM contract_imports WHERE id=$1 FOR UPDATE', [importId], c);
    if (!imp) throw notFound('Importación no encontrada.');
    if (imp.status !== 'VISTA_PREVIA') throw conflict('Esta importación ya fue aplicada o cancelada.');
    const wb = await readUpload(Buffer.from(imp.payload.b64, 'base64'), imp.filename);
    const v = await validateFile(wb);       // se valida de nuevo contra el estado actual
    const errs = v.issues.filter((i) => i.level === 'ERROR');
    if (errs.length) throw badRequest(`El archivo tiene ${errs.length} error(es). Corríjalos y vuelva a cargarlo; no se aplicó ningún cambio.`, errs.slice(0, 50));
    const clientIds = new Map<string, number>(); const contractIds = new Map<string, number>();
    for (const k of v.contracts) {
      let cid = k.existing_client_id ?? clientIds.get(k.client_key);
      if (!cid) { const cl = await createClient(c, k.client, user, ip, true); cid = cl.id; }
      clientIds.set(k.client_key, cid!);
      const created = await createContract({
        client_id: cid!, lot_id: k.lot_id, plan: k.plan, contract_date: k.date, apartado: fromCents(k.apartado), first_due_date: k.first, pay_day: k.pay_day,
        notes: k.notes, contract_number: k.number,
        exception: { price_agreed: fromCents(k.price), enganche: fromCents(k.enganche), n_installments: k.n, reason: `Contrato importado con sus condiciones históricas (importación #${importId}).` },
      }, user as any, ip, { db: c, source: 'IMPORTACION', status: k.status, allowAnyLotStatus: true });
      contractIds.set(k.number.toUpperCase(), created.id);
    }
    const touched = new Set<number>();
    const dbIds = new Map((await q<any>('SELECT id, upper(contract_number) n FROM contracts', [], c)).map((r) => [r.n, r.id]));
    for (const p of v.payments.sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row)) {
      const cid = contractIds.get(p.contract) ?? dbIds.get(p.contract);
      await registerPayment({ contract_id: cid, effective_date: p.date, concept: p.concept, capital: fromCents(p.capital), interest: fromCents(p.interest), method: p.method,
        reference: p.reference, notes: p.notes, scheduled_number: p.number && Number.isInteger(p.number) ? p.number : null, receipt_number: p.receipt },
        user, ip, { db: c, source: 'IMPORTACION', skipDuplicateCheck: true, deferRecompute: true });
      touched.add(cid!);
    }
    for (const id of touched) {
      await recomputeContract(c, id);
      const k = await one<any>('SELECT lot_id FROM contracts WHERE id=$1', [id], c); await syncLotStatus(c, k.lot_id);
    }
    const summary = { ...imp.summary, aplicados_contratos: v.contracts.length, aplicados_pagos: v.payments.length, clientes_creados: [...clientIds.values()].length };
    await q(`UPDATE contract_imports SET status='APLICADA', applied_at=now(), summary=$2, payload=NULL WHERE id=$1`, [importId, JSON.stringify(summary)], c);
    await audit(c, user, 'IMPORTACION_CONTRATOS', { entity: 'importacion_contratos', entityId: importId, after: { archivo: imp.filename, ...summary }, ip });
    return summary;
  });
}

export async function cancelContractImport(importId: number, user: AuditUser) {
  const r = await one<any>(`UPDATE contract_imports SET status='CANCELADA', payload=NULL WHERE id=$1 AND status='VISTA_PREVIA' RETURNING id`, [importId]);
  if (!r) throw conflict('La importación no está pendiente.');
  await audit((await import('../db')).pool(), user, 'IMPORTACION_CONTRATOS_CANCELADA', { entity: 'importacion_contratos', entityId: importId });
}

export async function listContractImports() {
  return q<any>(`SELECT ci.id, ci.filename, ci.created_at, ci.applied_at, ci.status, ci.summary, u.username FROM contract_imports ci JOIN users u ON u.id=ci.user_id ORDER BY ci.id DESC LIMIT 50`);
}
