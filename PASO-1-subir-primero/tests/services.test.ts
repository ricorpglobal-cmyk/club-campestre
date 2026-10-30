/**
 * Pruebas de integración contra PostgreSQL real (base *_test). Cubren los criterios de aceptación
 * de lógica de negocio. Las pruebas de HTTP/permisos/sesión están en tests/http.test.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { q, one, pool } from '@/lib/db';
import { hashPassword } from '@/lib/crypto';
import { login, userFromToken, CurrentUser } from '@/lib/auth';
import { createUser, updateUser } from '@/lib/services/users';
import { previewPriceImport, applyPriceImport, parsePriceSheet } from '@/lib/services/priceImport';
import { createClient } from '@/lib/services/clients';
import { createContract, contractSummary, previewContract, cancelContract } from '@/lib/services/contracts';
import { registerPayment, cancelPayment, previewPayment } from '@/lib/services/payments';
import { dashboard, calendar, monthly } from '@/lib/services/analytics';
import { buildReport } from '@/lib/services/reports';
import { previewContractImport, applyContractImport, contractTemplate } from '@/lib/services/contractImport';
import { statementPdf, receiptPdf } from '@/lib/services/pdf';
import { todayISO, addMonthsOnDay, addDays } from '@/lib/dates';
import { toCents } from '@/lib/money';

let admin: CurrentUser;
const ip = '127.0.0.1';
const today = todayISO();
const LISTA = readFileSync('tests/fixtures/lista_precios_hacienda_paraiso.xlsx');
const lotId = async (k: string) => (await one<any>('SELECT id FROM lots WHERE lot_key=$1', [k])).id;

beforeAll(async () => {
  const h = await hashPassword('AdminPrueba123');
  await q(`INSERT INTO users(username, full_name, password_hash, role) VALUES ('admin','Administrador Prueba',$1,'ADMINISTRADOR')`, [h]);
  const s = await login('admin', 'AdminPrueba123', ip, 'vitest');
  admin = (await userFromToken(s.token))!;
});

describe('Criterio 1-3: acceso y límite de 10 cuentas activas', () => {
  it('inicia sesión con credenciales correctas y rechaza incorrectas', async () => {
    const ok = await login('admin', 'AdminPrueba123', ip, 'vitest');
    expect(ok.token).toBeTruthy();
    await expect(login('admin', 'incorrecta123', ip, 'vitest')).rejects.toMatchObject({ status: 401 });
    await expect(login('noexiste', 'incorrecta123', ip, 'vitest')).rejects.toMatchObject({ status: 401 });
  });
  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    await createUser({ username: 'bloqueo', full_name: 'Usuario Bloqueo', role: 'CONSULTA', password: 'Bloqueo12345' }, admin, ip);
    for (let i = 0; i < 5; i++) await expect(login('bloqueo', 'malaClave123', ip, 'v')).rejects.toBeTruthy();
    await expect(login('bloqueo', 'Bloqueo12345', ip, 'v')).rejects.toMatchObject({ status: 423 });
    await q(`UPDATE users SET locked_until=NULL WHERE username='bloqueo'`);
  });
  it('impide la cuenta activa número 11 (app y base de datos)', async () => {
    const n = (await one<any>('SELECT count(*) n FROM users WHERE is_active')).n;
    for (let i = n; i < 10; i++) await createUser({ username: `user${i}`, full_name: `Usuario ${i}`, role: 'VENTAS' }, admin, ip);
    expect((await one<any>('SELECT count(*) n FROM users WHERE is_active')).n).toBe(10);
    await expect(createUser({ username: 'onceavo', full_name: 'Usuario Once', role: 'VENTAS' }, admin, ip)).rejects.toMatchObject({ code: 'P0010' });
    await expect(q(`INSERT INTO users(username, full_name, password_hash, role) VALUES ('directo','x','x','VENTAS')`)).rejects.toMatchObject({ code: 'P0010' });
    // se puede crear inactiva y no activarla mientras haya 10
    const r = await createUser({ username: 'inactivo', full_name: 'Usuario Inactivo', role: 'VENTAS', is_active: false }, admin, ip);
    await expect(updateUser(r.user.id, { is_active: true }, admin, ip)).rejects.toMatchObject({ code: 'P0010' });
    // al desactivar una, ya se puede activar otra
    const u = await one<any>(`SELECT id FROM users WHERE username='user9'`);
    await updateUser(u.id, { is_active: false }, admin, ip);
    await updateUser(r.user.id, { is_active: true }, admin, ip);
    expect((await one<any>('SELECT count(*) n FROM users WHERE is_active')).n).toBe(10);
  });
  it('un administrador no puede quitarse su propio rol', async () => {
    await expect(updateUser(admin.id, { role: 'VENTAS' }, admin, ip)).rejects.toMatchObject({ status: 403 });
  });
  it('las contraseñas se guardan con hash argon2', async () => {
    const r = await one<any>(`SELECT password_hash FROM users WHERE username='admin'`);
    expect(r.password_hash.startsWith('$argon2')).toBe(true);
    expect(r.password_hash).not.toContain('AdminPrueba123');
  });
});

describe('Criterio 5-6: importación de la lista de precios', () => {
  it('lee la lista real de Hacienda Paraíso: 253 lotes, sin errores', async () => {
    const p = await previewPriceImport(LISTA, 'lista.xlsx', admin);
    expect(p.summary.nuevos).toBe(253);
    expect(p.summary.errores).toBe(0);
    expect(p.summary.resaltados).toBe(79);
    const r = await applyPriceImport(p.importId, { markHighlighted: true }, admin, ip);
    expect(r.created).toBe(253);
    const l2 = await one<any>(`SELECT * FROM lots WHERE lot_key='2'`);
    expect(Number(l2.price_36)).toBe(180000); expect(Number(l2.down_36)).toBe(20000); expect(Number(l2.monthly_36)).toBe(4444.44);
    expect(Number(l2.price_cash)).toBe(171000); expect(l2.status).toBe('DISPONIBLE');
  });
  it('re-importar la misma lista no crea duplicados', async () => {
    const p = await previewPriceImport(LISTA, 'lista.xlsx', admin);
    expect(p.summary.nuevos).toBe(0); expect(p.summary.sin_cambio).toBe(253);
    expect((await one<any>('SELECT count(*) n FROM lots')).n).toBe(253);
  });
  it('detecta lotes duplicados, precios faltantes e inválidos', async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('L');
    ws.addRow(['LOTE', 'M²', 'PRECIO DE CONTADO', 'PRECIO FINANCIADO 36 MESES', 'ENGANCHE 36 MESES']);
    ws.addRow([300, 140, 150000, 160000, 20000]); ws.addRow([300, 140, 151000, 161000, 20000]);
    ws.addRow([301, 140, null, null, null]); ws.addRow([302, 140, -5, 100, 0]); ws.addRow([303, 140, 'abc', 100, 0]); ws.addRow([304, 150, 150000, 160000, 20000]);
    const p = parsePriceSheet(wb);
    const errs = p.issues.filter((i) => i.level === 'ERROR');
    expect(errs.some((e) => e.lote === '300' && /duplicado/i.test(e.message))).toBe(true);
    expect(errs.some((e) => e.lote === '301' && /faltante/i.test(e.message))).toBe(true);
    expect(errs.some((e) => e.lote === '302')).toBe(true);
    expect(errs.some((e) => e.lote === '303')).toBe(true);
    expect(p.rows.map((r) => r.key)).toEqual(['304']);
  });
});

let clientId: number; let k36: any; let k48: any;

describe('Criterio 8-11: clientes, contratos y calendario', () => {
  it('da de alta un cliente', async () => {
    const c = await createClient(pool(), { full_name: 'María López Hernández', phone: '462 123 4567', email: 'maria@example.com', rfc: 'LOHM800101AB1', municipality: 'Irapuato', state: 'Guanajuato', zip: '36500' } as any, admin, ip, true);
    clientId = c.id; expect(c.code).toMatch(/^CLI-\d{5}$/);
  });
  it('registra un contrato a 36 meses con calendario exacto', async () => {
    const date = addMonthsOnDay(today, -3);
    const pv = await previewContract({ client_id: clientId, lot_id: await lotId('2'), plan: '36', contract_date: date });
    expect(pv.price).toBe('180000.00'); expect(pv.enganche).toBe('20000.00'); expect(pv.n_installments).toBe(36);
    expect(pv.installment_amount).toBe('4444.44'); expect(pv.last_installment).toBe('4444.60');
    k36 = await createContract({ client_id: clientId, lot_id: await lotId('2'), plan: '36', contract_date: date }, admin as any, ip);
    const items = await q<any>('SELECT * FROM schedule_items WHERE contract_id=$1 ORDER BY kind, number', [k36.id]);
    expect(items.length).toBe(37);
    expect(items.reduce((a, i) => a + toCents(i.amount), 0)).toBe(18000000);
    const m = items.filter((i) => i.kind === 'MENSUAL');
    expect(m[0].due_date).toBe(addMonthsOnDay(date, 1)); expect(m[35].due_date).toBe(addMonthsOnDay(date, 36));
    expect((await one<any>(`SELECT status FROM lots WHERE lot_key='2'`)).status).toBe('CONTRATADO');
    expect(k36.list_snapshot.price).toBe('180000.00');
  });
  it('registra un contrato a 48 meses (lote 1, enganche 40,000)', async () => {
    k48 = await createContract({ client_id: clientId, lot_id: await lotId('1'), plan: '48', contract_date: today, apartado: 5000 }, admin as any, ip);
    expect(Number(k48.price_agreed)).toBe(320795.79); expect(Number(k48.enganche)).toBe(40000);
    // modo PRECIO: saldo financiado = precio − enganche − apartado
    expect(Number(k48.financed)).toBe(320795.79 - 40000 - 5000);
    const items = await q<any>('SELECT * FROM schedule_items WHERE contract_id=$1', [k48.id]);
    expect(items.filter((i) => i.kind === 'MENSUAL').length).toBe(48);
    expect(items.reduce((a, i) => a + toCents(i.amount), 0)).toBe(toCents('320795.79'));
  });
  it('día de pago 31 se ajusta al último día de meses cortos', async () => {
    const pv = await previewContract({ client_id: clientId, lot_id: await lotId('5'), plan: '36', contract_date: '2026-01-15', first_due_date: '2026-01-31', pay_day: 31 });
    const d = pv.schedule.filter((s) => s.kind === 'MENSUAL').map((s) => s.due_date);
    expect(d.slice(0, 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('Criterio 18: no se duplica un contrato activo', () => {
  it('rechaza un segundo contrato para el mismo terreno', async () => {
    await expect(createContract({ client_id: clientId, lot_id: await lotId('2'), plan: '48', contract_date: today }, admin as any, ip)).rejects.toMatchObject({ status: 409 });
    // ni siquiera saltándose la app
    await expect(q(`INSERT INTO contracts(contract_number, contract_date, client_id, lot_id, plan, price_agreed, apartado_mode, financed, n_installments, list_snapshot)
      VALUES ('X-1', now(), $1, $2, '36', 1, 'PRECIO', 0, 0, '{}')`, [clientId, await lotId('2')])).rejects.toMatchObject({ code: '23505' });
  });
  it('una condición especial exige permiso y motivo', async () => {
    const ventas = { ...admin, perms: new Set(['contratos.crear']) } as any;
    await expect(createContract({ client_id: clientId, lot_id: await lotId('3'), plan: '36', contract_date: today, exception: { enganche: 10000, reason: 'Promoción autorizada por dirección' } }, ventas, ip)).rejects.toMatchObject({ status: 403 });
    const k = await createContract({ client_id: clientId, lot_id: await lotId('3'), plan: '36', contract_date: today, exception: { enganche: 10000, reason: 'Promoción autorizada por dirección' } }, admin as any, ip);
    expect(k.is_exception).toBe(true); expect(k.exception_authorized_by).toBe(admin.id); expect(Number(k.financed)).toBe(170000);
  });
});

describe('Criterio 12-17: aportaciones, saldos y estado de cuenta', () => {
  const date = () => addMonthsOnDay(today, -3);
  it('registra el enganche', async () => {
    const r = await registerPayment({ contract_id: k36.id, effective_date: date(), concept: 'ENGANCHE', capital: 20000, method: 'TRANSFERENCIA', reference: 'SPEI-001', idempotency_key: 'clave-eng-0001' }, admin, ip);
    expect(r.distribution).toEqual([expect.objectContaining({ kind: 'ENGANCHE', amount: '20000.00' })]);
  });
  it('registra una aportación mensual completa', async () => {
    const r = await registerPayment({ contract_id: k36.id, effective_date: addMonthsOnDay(today, -2), concept: 'MENSUAL', capital: 4444.44, method: 'EFECTIVO', idempotency_key: 'clave-men-0001' }, admin, ip);
    expect(r.distribution).toEqual([expect.objectContaining({ kind: 'MENSUAL', number: 1, amount: '4444.44' })]);
  });
  it('registra un pago parcial', async () => {
    const pv = await previewPayment({ contract_id: k36.id, effective_date: addMonthsOnDay(today, -1), concept: 'MENSUAL', capital: 2000, method: 'DEPOSITO' });
    expect(pv.distribution).toEqual([expect.objectContaining({ number: 2, amount: '2000.00' })]);
    await registerPayment({ contract_id: k36.id, effective_date: addMonthsOnDay(today, -1), concept: 'MENSUAL', capital: 2000, method: 'DEPOSITO', idempotency_key: 'clave-par-0002' }, admin, ip);
  });
  it('el reintento con la misma clave no duplica la aportación', async () => {
    const a = await registerPayment({ contract_id: k36.id, effective_date: addMonthsOnDay(today, -1), concept: 'MENSUAL', capital: 2000, method: 'DEPOSITO', idempotency_key: 'clave-par-0002' }, admin, ip);
    expect(a.replay).toBe(true);
    expect((await one<any>('SELECT count(*) n FROM payments WHERE contract_id=$1', [k36.id])).n).toBe(3);
  });
  it('advierte posible duplicado (mismo día e importe) y exige confirmación', async () => {
    await expect(registerPayment({ contract_id: k36.id, effective_date: addMonthsOnDay(today, -1), concept: 'MENSUAL', capital: 2000, method: 'DEPOSITO' }, admin, ip)).rejects.toMatchObject({ status: 409 });
  });
  it('valida importes, fechas y contratos', async () => {
    await expect(registerPayment({ contract_id: k36.id, effective_date: addDays(today, 1), concept: 'MENSUAL', capital: 100, method: 'EFECTIVO' }, admin, ip)).rejects.toMatchObject({ status: 400 });
    await expect(registerPayment({ contract_id: k36.id, effective_date: today, concept: 'MENSUAL', capital: -100, method: 'EFECTIVO' }, admin, ip)).rejects.toBeTruthy();
    await expect(registerPayment({ contract_id: 999999, effective_date: today, concept: 'MENSUAL', capital: 100, method: 'EFECTIVO' }, admin, ip)).rejects.toMatchObject({ status: 404 });
    await expect(registerPayment({ contract_id: k36.id, effective_date: today, concept: 'MENSUAL', capital: 999999, method: 'EFECTIVO' }, admin, ip)).rejects.toMatchObject({ status: 400 });
  });
  it('estado de cuenta y saldos correctos', async () => {
    const s = await contractSummary(k36.id);
    expect(s.totals.enganche).toBe(2000000);
    expect(s.totals.aportaciones_capital).toBe(444444 + 200000);
    expect(s.totals.capital_pending).toBe(18000000 - 2000000 - 444444 - 200000);
    expect(s.totals.n_covered).toBe(1);
    const st = s.states.filter((x) => x.kind === 'MENSUAL');
    expect(st[0].status).toBe('PAGADA'); expect(st[1].status).toBe('PARCIAL'); expect(st[1].balance).toBe(244444);
    // la aportación 3 vence hoy → no está vencida; la 2 sí (parcial vencida)
    expect(st[1].overdue).toBe(true);
    expect(s.status).toBe('ATRASADO');
    const pdf = await statementPdf(k36.id, 'Prueba', admin, 'America/Mexico_City');
    expect(pdf.buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('un adelanto se aplica a las siguientes aportaciones y se identifica', async () => {
    const pv = await previewPayment({ contract_id: k48.id, effective_date: today, concept: 'MENSUAL', capital: 12000, method: 'EFECTIVO' });
    expect(pv.distribution.length).toBeGreaterThan(1);
    expect(pv.distribution[0].advance).toBe(true);
  });
});

describe('Criterio 22-23: cancelaciones y reversos', () => {
  it('cancela una aportación con motivo; no se suma a la cobranza efectiva', async () => {
    const before = await dashboard({});
    const p = await one<any>(`SELECT * FROM payments WHERE idempotency_key='clave-par-0002'`);
    await expect(cancelPayment(p.id, '', admin, ip)).rejects.toMatchObject({ status: 400 });
    await cancelPayment(p.id, 'Depósito rechazado por el banco', admin, ip);
    const after = await dashboard({});
    expect(before.collection.all.total - after.collection.all.total).toBe(200000);
    const s = await contractSummary(k36.id);
    expect(s.states.find((x) => x.kind === 'MENSUAL' && x.number === 2)!.paid).toBe(0);
    expect(s.payments.find((x: any) => x.id === p.id).status).toBe('CANCELADA');   // se conserva en historial
    expect(await one<any>('SELECT * FROM payment_reversals WHERE payment_id=$1', [p.id])).toBeTruthy();
    const rec = await receiptPdf(p.id, 'Prueba', admin, 'America/Mexico_City');
    expect(rec.buf.length).toBeGreaterThan(1000);
  });
  it('no permite borrar aportaciones ni modificar la auditoría', async () => {
    await expect(q('DELETE FROM payments')).rejects.toMatchObject({ code: 'P0011' });
    await expect(q(`UPDATE payments SET capital=1 WHERE idempotency_key='clave-men-0001'`)).rejects.toMatchObject({ code: 'P0011' });
    await expect(q('DELETE FROM audit_log')).rejects.toMatchObject({ code: 'P0011' });
    await expect(q(`UPDATE audit_log SET action='x'`)).rejects.toMatchObject({ code: 'P0011' });
    await expect(q('TRUNCATE audit_log')).rejects.toBeTruthy();
  });
  it('liquidación: contrato de contado pasa a LIQUIDADO y se revierte al cancelar el pago', async () => {
    const k = await createContract({ client_id: clientId, lot_id: await lotId('10'), plan: 'CONTADO', contract_date: today }, admin as any, ip);
    const r = await registerPayment({ contract_id: k.id, effective_date: today, concept: 'LIQUIDACION', capital: k.price_agreed, method: 'TRANSFERENCIA', reference: 'LIQ-1' }, admin, ip);
    expect((await one<any>('SELECT status FROM contracts WHERE id=$1', [k.id])).status).toBe('LIQUIDADO');
    expect((await one<any>(`SELECT status FROM lots WHERE lot_key='10'`)).status).toBe('LIQUIDADO');
    await cancelPayment(r.payment.id, 'Transferencia duplicada por error', admin, ip);
    expect((await one<any>('SELECT status FROM contracts WHERE id=$1', [k.id])).status).toBe('ACTIVO');
    expect((await one<any>(`SELECT status FROM lots WHERE lot_key='10'`)).status).toBe('CONTRATADO');
  });
  it('cancela un contrato: el terreno se libera y el historial se conserva', async () => {
    const k = await createContract({ client_id: clientId, lot_id: await lotId('20'), plan: '36', contract_date: today }, admin as any, ip);
    await cancelContract(k.id, 'El cliente desistió de la compra', admin, ip);
    expect((await one<any>(`SELECT status FROM lots WHERE lot_key='20'`)).status).toBe('DISPONIBLE');
    expect((await one<any>('SELECT status FROM contracts WHERE id=$1', [k.id])).status).toBe('CANCELADO');
    const again = await createContract({ client_id: clientId, lot_id: await lotId('20'), plan: '48', contract_date: today }, admin as any, ip);
    expect(again.id).not.toBe(k.id);
  });
});

describe('Criterio 7 y 26: actualizar precios no altera contratos', () => {
  it('cambia el precio del lote 2 en la lista sin tocar el contrato pactado', async () => {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Lista');
    ws.addRow(['LOTE', 'M²', 'PRECIO DE CONTADO', 'PRECIO FINANCIADO 36 MESES', 'ENGANCHE 36 MESES', 'PAGO MENSUAL 36 MESES', 'PRECIO FINANCIADO 48 MESES', 'ENGANCHE 48 MESES', 'PAGO MENSUAL 48 MESES']);
    ws.addRow([2, 140, 190000, 199000, 25000, null, 210000, 25000, null]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const pv = await previewPriceImport(buf, 'nueva.xlsx', admin);
    expect(pv.summary.actualizados).toBe(1); expect(pv.notIncluded.length).toBe(252);
    await applyPriceImport(pv.importId, { markHighlighted: false }, admin, ip);
    const lot = await one<any>(`SELECT * FROM lots WHERE lot_key='2'`);
    expect(Number(lot.price_36)).toBe(199000); expect(Number(lot.monthly_36)).toBe(4833.33);
    const k = await one<any>('SELECT * FROM contracts WHERE id=$1', [k36.id]);
    expect(Number(k.price_agreed)).toBe(180000); expect(Number(k.enganche)).toBe(20000);
    const items = await q<any>('SELECT sum(amount) s FROM schedule_items WHERE contract_id=$1', [k36.id]);
    expect(Number(items[0].s)).toBe(180000);
    const h = await q<any>('SELECT * FROM lot_price_history WHERE lot_id=$1 ORDER BY id', [lot.id]);
    expect(h.length).toBe(2); expect(h[1].old_values.price_36).toBe('180000.00'); expect(h[1].new_values.price_36).toBe('199000.00');
    expect((await one<any>('SELECT count(*) n FROM lots')).n).toBe(253);   // los no incluidos no se borran
  });
});

describe('Criterio 17, 19: terrenos disponibles y dashboard', () => {
  it('distingue ventas contratadas de cobranza recibida', async () => {
    const d = await dashboard({ from: today, to: today });
    // el contrato de 48 meses firmado hoy suma a ventas del día, pero no a la cobranza del día
    expect(d.commercial.day.amount).toBeGreaterThanOrEqual(toCents('320795.79'));
    const cobradoHoy = await one<any>(`SELECT coalesce(sum(total),0) s FROM payments WHERE status='CONFIRMADA' AND effective_date=$1`, [today]);
    expect(d.collection.day.total).toBe(toCents(cobradoHoy.s));
    expect(d.lots.total).toBe(253);
    expect(d.lots.DISPONIBLE).toBe((await one<any>(`SELECT count(*) n FROM lots WHERE status='DISPONIBLE'`)).n);
    const m = await monthly(Number(today.slice(0, 4)), {});
    expect(m.length).toBe(12);
    const cal = await calendar({ preset: 'vencidas' });
    expect(cal.rows.every((r) => r.overdue)).toBe(true);
  });
});

describe('Criterio 20-21: reportes .xlsx coinciden con la base', () => {
  it('cobranza por día y cartera vencida', async () => {
    const r = await buildReport('cobranza_dia', {}, admin, ip);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.buf as any);
    const ws = wb.getWorksheet('Cobranza por día')!;
    let total = 0; let rows = 0;
    ws.eachRow((row, i) => { const v = row.getCell(9).value; if (i > 5 && typeof v === 'number') { total += Math.round(v * 100); rows++; } });
    const db = await one<any>(`SELECT count(*) n, sum(total) s FROM payments WHERE status='CONFIRMADA'`);
    expect(rows).toBe(db.n); expect(total).toBe(toCents(db.s));
    const cv = await buildReport('cartera_vencida', {}, admin, ip);
    expect(cv.filename).toBe(`Cartera_Vencida_${today}.xlsx`);
    for (const k of ['ventas_dia', 'ventas_mes', 'cobranza_mes', 'cobranza_cliente', 'inventario']) expect((await buildReport(k, { year: today.slice(0, 4) }, admin, ip)).buf.length).toBeGreaterThan(3000);
    expect((await buildReport('estado_cuenta', { contract_id: k36.id }, admin, ip)).filename).toContain(k36.contract_number);
    expect((await one<any>(`SELECT count(*) n FROM audit_log WHERE action='EXPORTACION'`)).n).toBeGreaterThan(5);
  });
  it('respeta permisos al exportar', async () => {
    const ventas = { ...admin, perms: new Set(['reportes.ventas', 'reportes.exportar']) } as any;
    await expect(buildReport('cobranza_dia', {}, ventas, ip)).rejects.toMatchObject({ status: 403 });
    expect((await buildReport('ventas_mes', {}, ventas, ip)).buf.length).toBeGreaterThan(1000);
  });
});

describe('Importación de contratos y pagos históricos', () => {
  async function file(rows: any[][], pays: any[][]) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load((await contractTemplate()) as any);
    for (const r of rows) wb.getWorksheet('Contratos')!.addRow(r);
    for (const r of pays) wb.getWorksheet('Pagos')!.addRow(r);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const C = (num: string, lote: number, nombre: string, extra: Partial<Record<string, any>> = {}) => {
    const base: any = { NUMERO_CONTRATO: num, FECHA_CONTRATO: '15/01/2025', LOTE: lote, MANZANA: null, PLAN: '36', PRECIO_PACTADO: 170000, APARTADO: 0, ENGANCHE: 20000, NUM_APORTACIONES: 36,
      FECHA_PRIMERA_APORTACION: '15/02/2025', DIA_PAGO: 15, ESTATUS: 'ACTIVO', CLIENTE_NOMBRE: nombre, TELEFONO: '4621112233', ...extra };
    return ['NUMERO_CONTRATO', 'FECHA_CONTRATO', 'LOTE', 'MANZANA', 'PLAN', 'PRECIO_PACTADO', 'APARTADO', 'ENGANCHE', 'NUM_APORTACIONES', 'FECHA_PRIMERA_APORTACION', 'DIA_PAGO', 'ESTATUS', 'CLIENTE_NOMBRE', 'TELEFONO'].map((k) => base[k]);
  };
  it('un error en el archivo impide aplicar y no carga nada', async () => {
    const buf = await file([C('HIST-001', 50, 'Juan Pérez'), C('HIST-002', 9999, 'Ana Ruiz')], [['HIST-001', '15/01/2025', 'ENGANCHE', 20000, 0, 'EFECTIVO']]);
    const pv = await previewContractImport(buf, 'h.xlsx', admin);
    expect(pv.summary.errores).toBeGreaterThan(0);
    expect(pv.issues.some((i) => /9999/.test(i.message))).toBe(true);
    await expect(applyContractImport(pv.importId, admin, ip)).rejects.toMatchObject({ status: 400 });
    expect(await one<any>(`SELECT 1 FROM contracts WHERE contract_number='HIST-001'`)).toBeNull();
  });
  it('carga contratos históricos con su precio pactado y aplica los pagos', async () => {
    const buf = await file([C('HIST-001', 50, 'Juan Pérez'), C('HIST-002', 51, 'Juan Pérez'), C('HIST-003', 52, 'Ana Ruiz', { ESTATUS: 'CANCELADO' })], [
      ['HIST-001', '15/01/2025', 'ENGANCHE', 20000, 0, 'EFECTIVO'], ['HIST-001', '15/02/2025', 'MENSUAL', 4166.67, 0, 'TRANSFERENCIA', 'SPEI-9'],
      ['HIST-001', '16/03/2025', 'Aportación mensual', 4166.67, 150, 'Transferencia bancaria'], ['HIST-002', '15/01/2025', 'ENGANCHE', 20000, 0, 'DEPOSITO'],
    ]);
    const pv = await previewContractImport(buf, 'h.xlsx', admin);
    expect(pv.summary.errores).toBe(0); expect(pv.summary.contratos).toBe(3); expect(pv.summary.pagos).toBe(4); expect(pv.summary.clientes_nuevos).toBe(2);
    const r = await applyContractImport(pv.importId, admin, ip);
    expect(r.aplicados_contratos).toBe(3);
    const k = await one<any>(`SELECT * FROM contracts WHERE contract_number='HIST-001'`);
    expect(Number(k.price_agreed)).toBe(170000); expect(k.source).toBe('IMPORTACION');
    const s = await contractSummary(k.id);
    expect(s.totals.n_covered).toBe(2); expect(s.totals.interest).toBe(15000);
    const juan = await q<any>(`SELECT id FROM clients WHERE full_name='Juan Pérez'`); expect(juan.length).toBe(1);
    expect((await one<any>(`SELECT status FROM lots WHERE lot_key='52'`)).status).toBe('DISPONIBLE');
    expect((await one<any>(`SELECT status FROM lots WHERE lot_key='50'`)).status).toBe('CONTRATADO');
    await expect(applyContractImport(pv.importId, admin, ip)).rejects.toMatchObject({ status: 409 });
  });
});
