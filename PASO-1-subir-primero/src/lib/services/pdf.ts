import PDFDocument from 'pdfkit';
import { mxn, fromCents } from '../money';
import { fmtDate, fmtDateTime } from '../dates';
import { contractSummary, PLAN_LABEL } from './contracts';
import { COLLECTION_LABEL, ITEM_STATUS_LABEL } from './ledger';
import { CONCEPT_LABEL, METHOD_LABEL, getPayment } from './payments';

const GREEN = '#244335'; const GREY = '#555555'; const LIGHT = '#eef2ef';
const c2 = (c: number) => mxn(fromCents(c));

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((res, rej) => { const chunks: Buffer[] = []; doc.on('data', (d) => chunks.push(d)); doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); doc.end(); });
}

function header(doc: PDFKit.PDFDocument, title: string, project: string, generated: string) {
  doc.rect(0, 0, doc.page.width, 70).fill(GREEN);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text('CLUB CAMPESTRE', 40, 20);
  doc.font('Helvetica').fontSize(9).text('SISTEMA DE CONTROL DE VENTAS Y COBRANZA', 40, 40);
  doc.font('Helvetica-Bold').fontSize(13).text(title, 300, 22, { width: doc.page.width - 340, align: 'right' });
  doc.font('Helvetica').fontSize(8).text(project, 300, 42, { width: doc.page.width - 340, align: 'right' });
  doc.fillColor(GREY).fontSize(8).text(generated, 40, 78, { width: doc.page.width - 80, align: 'right' });
  doc.fillColor('#000000').moveDown();
  doc.y = 100;
}

type Col = { h: string; w: number; align?: 'left' | 'right' | 'center' };
function table(doc: PDFKit.PDFDocument, cols: Col[], rows: string[][], x = 40) {
  const rowH = 15;
  const drawHead = () => {
    let cx = x; doc.rect(x, doc.y, cols.reduce((a, c) => a + c.w, 0), rowH + 2).fill(GREEN);
    const y = doc.y + 4; doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
    for (const c of cols) { doc.text(c.h, cx + 3, y, { width: c.w - 6, height: 9, align: c.align ?? 'left', ellipsis: true }); cx += c.w; }
    doc.y = y + rowH - 1; doc.fillColor('#000');
  };
  drawHead();
  rows.forEach((r, i) => {
    if (doc.y + rowH > doc.page.height - 50) { doc.addPage(); doc.y = 40; drawHead(); }
    if (i % 2 === 1) doc.rect(x, doc.y - 2, cols.reduce((a, c) => a + c.w, 0), rowH).fill(LIGHT).fillColor('#000');
    let cx = x; const y = doc.y + 1; doc.font('Helvetica').fontSize(7.5).fillColor('#111');
    r.forEach((v, j) => { doc.text(v ?? '', cx + 3, y, { width: cols[j].w - 6, height: 9, align: cols[j].align ?? 'left', ellipsis: true }); cx += cols[j].w; });
    doc.y = y + rowH - 1;
  });
  doc.moveDown(0.5);
}

function kvGrid(doc: PDFKit.PDFDocument, pairs: [string, string][], cols = 2, x = 40, width = 515) {
  const cw = width / cols; const startY = doc.y; let maxY = startY;
  pairs.forEach(([k, v], i) => {
    const cx = x + (i % cols) * cw; const y = startY + Math.floor(i / cols) * 26;
    doc.font('Helvetica').fontSize(7).fillColor(GREY).text(k.toUpperCase(), cx, y, { width: cw - 10 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(v, cx, y + 9, { width: cw - 10, height: 13, ellipsis: true });
    maxY = Math.max(maxY, y + 26);
  });
  doc.y = maxY + 4;
}

function section(doc: PDFKit.PDFDocument, t: string) {
  doc.moveDown(0.3); doc.font('Helvetica-Bold').fontSize(10).fillColor(GREEN).text(t, 40); doc.moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).strokeColor(GREEN).lineWidth(0.8).stroke(); doc.moveDown(0.6); doc.fillColor('#000');
}

export async function statementPdf(contractId: number, project: string, user: { full_name: string; username: string }, tz: string) {
  const s = await contractSummary(contractId);
  const k = s.contract; const t = s.totals;
  const doc = new PDFDocument({ size: 'LETTER', margin: 40, info: { Title: `Estado de cuenta ${k.contract_number}`, Author: 'Club Campestre' } });
  header(doc, 'ESTADO DE CUENTA', project, `Generado el ${fmtDateTime(new Date(), tz)} por ${user.full_name} (${user.username})`);
  section(doc, 'DATOS GENERALES');
  kvGrid(doc, [['Cliente', k.client_name], ['Número de contrato', k.contract_number], ['Terreno', k.lot_key], ['Fecha de contrato', fmtDate(k.contract_date)],
    ['Precio pactado', mxn(k.price_agreed)], ['Plan de financiamiento', PLAN_LABEL[k.plan]], ['Estatus', COLLECTION_LABEL[s.status]], ['Próxima fecha de pago', t.next_due ? fmtDate(t.next_due) : '—']], 4);
  section(doc, 'RESUMEN FINANCIERO');
  kvGrid(doc, [['Precio total', c2(t.price)], ['Apartado registrado', c2(t.apartado)], ['Enganche recibido', c2(t.enganche)], ['Aportaciones de capital', c2(t.aportaciones_capital)],
    ['Intereses cobrados', c2(t.interest)], ['Total histórico recibido', c2(t.total_received)], ['Capital pendiente', c2(t.capital_pending)], ['Intereses pendientes', c2(t.interest_pending)],
    ['Total actualizado pendiente', c2(t.total_pending)], ['Aportaciones programadas', String(t.n_scheduled)], ['Aportaciones cubiertas', String(t.n_covered)], ['Pendientes / vencidas', `${t.n_pending} / ${t.n_overdue}`]], 4);
  section(doc, 'HISTORIAL DETALLADO');
  const ok = s.payments.filter((p: any) => p.status === 'CONFIRMADA');
  if (!ok.length) doc.font('Helvetica').fontSize(9).text('Sin operaciones confirmadas.', 40);
  else table(doc, [{ h: 'Fecha', w: 50 }, { h: 'Recibo', w: 70 }, { h: 'Concepto', w: 78 }, { h: 'No.', w: 24, align: 'center' }, { h: 'Capital', w: 60, align: 'right' },
    { h: 'Interés', w: 48, align: 'right' }, { h: 'Total', w: 62, align: 'right' }, { h: 'Forma de pago', w: 68 }, { h: 'Referencia', w: 55 }],
    ok.map((p: any) => [fmtDate(p.effective_date), p.receipt_number, CONCEPT_LABEL[p.concept], p.scheduled_number != null ? String(p.scheduled_number) : '', mxn(p.capital), mxn(p.interest), mxn(p.total), METHOD_LABEL[p.method].replace(' bancaria', ''), p.reference ?? '']));
  section(doc, 'CALENDARIO DE APORTACIONES');
  table(doc, [{ h: 'Tipo', w: 60 }, { h: 'No.', w: 28, align: 'center' }, { h: 'Vencimiento', w: 60 }, { h: 'Programado', w: 70, align: 'right' }, { h: 'Pagado', w: 70, align: 'right' },
    { h: 'Saldo', w: 70, align: 'right' }, { h: 'Fecha pago', w: 55 }, { h: 'Atraso', w: 35, align: 'right' }, { h: 'Estatus', w: 67 }],
    s.states.map((x) => [x.kind === 'MENSUAL' ? 'Aportación' : x.kind === 'ENGANCHE' ? 'Enganche' : 'Apartado', x.number ? String(x.number) : '', fmtDate(x.due_date), c2(x.amount), c2(x.paid), c2(x.balance), fmtDate(x.paid_date), x.days_late ? `${x.days_late} d` : '', ITEM_STATUS_LABEL[x.status]]));
  doc.font('Helvetica').fontSize(7).fillColor(GREY).text('Este estado de cuenta se genera a partir de las operaciones confirmadas registradas en el sistema. Las aportaciones canceladas no se incluyen en los totales.', 40, doc.y + 6, { width: 515 });
  return { buf: await toBuffer(doc), filename: `Estado_Cuenta_${k.contract_number}.pdf` };
}

export async function receiptPdf(paymentId: number, project: string, user: { full_name: string; username: string }, tz: string) {
  const { payment: p, apps } = await getPayment(paymentId);
  const s = await contractSummary(p.contract_id);
  const doc = new PDFDocument({ size: 'LETTER', margin: 40, info: { Title: `Recibo ${p.receipt_number}`, Author: 'Club Campestre' } });
  header(doc, `RECIBO ${p.receipt_number}`, project, `Emitido el ${fmtDateTime(new Date(), tz)} por ${user.full_name}`);
  if (p.status === 'CANCELADA') { doc.save().rotate(-30, { origin: [300, 400] }).font('Helvetica-Bold').fontSize(70).fillColor('#cc0000').opacity(0.18).text('CANCELADO', 80, 360).restore(); doc.opacity(1); }
  section(doc, 'DATOS DE LA APORTACIÓN');
  kvGrid(doc, [['Cliente', p.client_name], ['Contrato', p.contract_number], ['Terreno', p.lot_key], ['Fecha efectiva', fmtDate(p.effective_date)],
    ['Concepto', CONCEPT_LABEL[p.concept]], ['Forma de pago', METHOD_LABEL[p.method]], ['Referencia', p.reference || '—'], ['Registró', p.user_full_name || p.username || '—']], 4);
  section(doc, 'IMPORTE');
  kvGrid(doc, [['Capital', mxn(p.capital)], ['Interés', mxn(p.interest)], ['Total recibido', mxn(p.total)], ['Saldo de capital actual', c2(s.totals.capital_pending)]], 4);
  if (apps.length) { section(doc, 'APLICACIÓN AL CALENDARIO'); table(doc, [{ h: 'Obligación', w: 200 }, { h: 'Vencimiento', w: 120 }, { h: 'Importe aplicado', w: 120, align: 'right' }],
    apps.map((a) => [a.kind === 'MENSUAL' ? `Aportación ${a.number}` : a.kind === 'ENGANCHE' ? 'Enganche' : 'Apartado', fmtDate(a.due_date), mxn(a.amount)])); }
  if (p.notes) { section(doc, 'OBSERVACIONES'); doc.font('Helvetica').fontSize(9).text(p.notes, 40, doc.y, { width: 515 }); }
  doc.moveDown(4); const y = doc.y;
  doc.moveTo(80, y).lineTo(260, y).strokeColor('#000').lineWidth(0.5).stroke(); doc.moveTo(340, y).lineTo(520, y).stroke();
  doc.font('Helvetica').fontSize(8).text('Recibí', 80, y + 4, { width: 180, align: 'center' }); doc.text('Entregó', 340, y + 4, { width: 180, align: 'center' });
  return { buf: await toBuffer(doc), filename: `Recibo_${p.receipt_number}.pdf` };
}
