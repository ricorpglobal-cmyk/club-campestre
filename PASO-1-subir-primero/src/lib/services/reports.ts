import ExcelJS from 'exceljs';
import { q, pool } from '../db';
import { addTableSheet, ColDef } from '../excel';
import { fromCents, toCents } from '../money';
import { fmtDate, fmtDateTime, monthBounds, todayISO } from '../dates';
import { getConfig } from '../config';
import { audit } from '../audit';
import { CurrentUser } from '../auth';
import { forbidden, badRequest } from '../errors';
import { Perm } from '../permissions';
import { listPayments, CONCEPT_LABEL, METHOD_LABEL } from './payments';
import { contractsWithStatus, overduePortfolio, Filters } from './analytics';
import { contractSummary, PLAN_LABEL, CONTRACT_STATUS_LABEL } from './contracts';
import { COLLECTION_LABEL, ITEM_STATUS_LABEL } from './ledger';
import { LOT_STATUS_LABEL, listLots } from './lots';

export const REPORTS: Record<string, { title: string; perm: Perm; desc: string }> = {
  ventas_dia: { title: 'A. Ventas por día', perm: 'reportes.ventas', desc: 'Contratos celebrados por fecha' },
  ventas_mes: { title: 'B. Ventas por mes', perm: 'reportes.ventas', desc: 'Resumen mensual de contratación' },
  cobranza_dia: { title: 'C. Cobranza por día', perm: 'reportes.cobranza', desc: 'Detalle de aportaciones recibidas' },
  cobranza_mes: { title: 'D. Cobranza por mes', perm: 'reportes.cobranza', desc: 'Resumen mensual de cobranza' },
  cobranza_cliente: { title: 'E. Cobranza por cliente', perm: 'reportes.cobranza', desc: 'Movimientos y saldo por cliente' },
  cartera_vencida: { title: 'F. Cartera vencida', perm: 'reportes.cobranza', desc: 'Contratos con importes vencidos' },
  inventario: { title: 'G. Inventario de terrenos', perm: 'terrenos.ver', desc: 'Catálogo con precios vigentes y estatus' },
  estado_cuenta: { title: 'H. Estado de cuenta individual', perm: 'estados.ver', desc: 'Contrato, historial y saldos' },
};

export type ReportParams = Filters & { day?: string; month?: string; year?: string; method?: string; contract_id?: number; contract?: string };

function resolveRange(p: ReportParams, today: string): { from?: string; to?: string; label: string; tag: string } {
  if (p.day) return { from: p.day, to: p.day, label: `Día ${fmtDate(p.day)}`, tag: p.day };
  if (p.month) { const [y, m] = p.month.split('-').map(Number); const [a, b] = monthBounds(y, m); return { from: a, to: b, label: `Mes ${p.month}`, tag: p.month }; }
  if (p.year) return { from: `${p.year}-01-01`, to: `${p.year}-12-31`, label: `Año ${p.year}`, tag: p.year };
  if (p.from || p.to) return { from: p.from, to: p.to, label: `Del ${fmtDate(p.from) || 'inicio'} al ${fmtDate(p.to) || 'hoy'}`, tag: `${p.from ?? 'inicio'}_${p.to ?? today}` };
  return { label: 'Todo el historial', tag: today };
}

const money = (c: number) => Number(fromCents(c));

export async function buildReport(kind: string, params: ReportParams, user: CurrentUser, ip: string | null): Promise<{ buf: Buffer; filename: string }> {
  const def = REPORTS[kind];
  if (!def) throw badRequest('Reporte no reconocido.');
  if (!user.perms.has('reportes.exportar') || !user.perms.has(def.perm)) throw forbidden('No tiene permiso para exportar este reporte.');
  if (params.user_id && !user.perms.has('dashboard.filtro_usuario')) params.user_id = undefined;
  const cfg = await getConfig();
  const today = todayISO(cfg.zona_horaria);
  const r = resolveRange(params, today);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Club Campestre — Sistema de Control de Ventas y Cobranza'; wb.created = new Date();
  const sub = [cfg.nombre_proyecto, `Periodo: ${r.label}`, `Generado: ${fmtDateTime(new Date(), cfg.zona_horaria)} por ${user.full_name} (${user.username})`];
  const fp: unknown[] = []; const fw: string[] = [];
  const addF = (sql: string, v: unknown) => { fp.push(v); fw.push(sql.replace(/\?/g, `$${fp.length}`)); };
  if (params.client_id) addF('k.client_id = ?', params.client_id);
  if (params.lot) addF('(upper(l.lot_key) = ? OR upper(l.lot_number) = ?)', params.lot.toUpperCase());
  if (params.contract) addF('upper(k.contract_number) = ?', params.contract.toUpperCase());
  if (params.status) addF('k.status = ?', params.status);
  let filename = '';

  if (kind === 'ventas_dia' || kind === 'ventas_mes') {
    if (r.from) addF('k.contract_date >= ?', r.from);
    if (r.to) addF('k.contract_date <= ?', r.to);
    if (params.user_id) addF('k.responsible_user_id = ?', params.user_id);
    const rows = await q<any>(`SELECT k.contract_date, k.contract_number, cl.full_name, l.lot_key, k.plan, k.price_agreed, k.enganche, k.apartado, k.status, u.username
      FROM contracts k JOIN clients cl ON cl.id=k.client_id JOIN lots l ON l.id=k.lot_id LEFT JOIN users u ON u.id=k.responsible_user_id
      WHERE k.status <> 'CANCELADO' ${fw.length ? 'AND ' + fw.join(' AND ') : ''} ORDER BY k.contract_date, k.contract_number`, fp);
    if (kind === 'ventas_dia') {
      const cols: ColDef[] = [{ header: 'Fecha', key: 'fecha', type: 'date' }, { header: 'Contrato', key: 'contrato' }, { header: 'Cliente', key: 'cliente', width: 32 },
        { header: 'Terreno', key: 'terreno', width: 10 }, { header: 'Plan', key: 'plan', width: 12 }, { header: 'Importe pactado', key: 'precio', type: 'money' },
        { header: 'Enganche pactado', key: 'enganche', type: 'money' }, { header: 'Apartado', key: 'apartado', type: 'money' }, { header: 'Estatus', key: 'estatus', width: 12 }, { header: 'Responsable', key: 'resp', width: 14 }];
      addTableSheet(wb, 'Ventas por día', 'VENTAS CONTRATADAS POR DÍA', sub, cols, rows.map((x) => ({ fecha: x.contract_date, contrato: x.contract_number, cliente: x.full_name, terreno: x.lot_key,
        plan: PLAN_LABEL[x.plan], precio: Number(x.price_agreed), enganche: Number(x.enganche), apartado: Number(x.apartado), estatus: CONTRACT_STATUS_LABEL[x.status], resp: x.username })), ['precio', 'enganche', 'apartado']);
      const byDay = new Map<string, any>();
      for (const x of rows) { const e = byDay.get(x.contract_date) ?? { fecha: x.contract_date, n: 0, precio: 0, enganche: 0 }; e.n++; e.precio += toCents(x.price_agreed); e.enganche += toCents(x.enganche); byDay.set(x.contract_date, e); }
      addTableSheet(wb, 'Resumen diario', 'RESUMEN DE VENTAS POR DÍA', sub, [{ header: 'Fecha', key: 'fecha', type: 'date' }, { header: 'Contratos', key: 'n', type: 'int' }, { header: 'Importe contratado', key: 'precio', type: 'money' }, { header: 'Enganches pactados', key: 'enganche', type: 'money' }],
        [...byDay.values()].map((e) => ({ ...e, precio: money(e.precio), enganche: money(e.enganche) })), ['n', 'precio', 'enganche']);
      filename = `Ventas_${r.tag}.xlsx`;
    } else {
      const byM = new Map<string, any>();
      for (const x of rows) { const k = x.contract_date.slice(0, 7); const e = byM.get(k) ?? { mes: k, n: 0, lotes: new Set(), precio: 0, enganche: 0 }; e.n++; e.lotes.add(x.lot_key); e.precio += toCents(x.price_agreed); e.enganche += toCents(x.enganche); byM.set(k, e); }
      addTableSheet(wb, 'Ventas por mes', 'VENTAS CONTRATADAS POR MES', sub, [{ header: 'Mes', key: 'mes', width: 10 }, { header: 'Contratos nuevos', key: 'n', type: 'int' }, { header: 'Terrenos contratados', key: 'lotes', type: 'int' },
        { header: 'Total contratado', key: 'precio', type: 'money' }, { header: 'Enganches pactados', key: 'enganche', type: 'money' }],
        [...byM.values()].map((e) => ({ mes: e.mes, n: e.n, lotes: e.lotes.size, precio: money(e.precio), enganche: money(e.enganche) })), ['n', 'lotes', 'precio', 'enganche']);
      filename = `Ventas_${r.tag}.xlsx`;
    }
  }

  if (kind === 'cobranza_dia' || kind === 'cobranza_mes' || kind === 'cobranza_cliente') {
    const pays = (await listPayments({ from: r.from, to: r.to, client_id: params.client_id, method: params.method, status: 'CONFIRMADA', user_id: params.user_id, limit: 100000 }))
      .filter((p) => (!params.lot || p.lot_key.toUpperCase() === params.lot.toUpperCase()) && (!params.contract || p.contract_number.toUpperCase() === params.contract.toUpperCase()))
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.id - b.id);
    if (kind === 'cobranza_dia') {
      addTableSheet(wb, 'Cobranza por día', 'COBRANZA RECIBIDA (fecha efectiva)', sub, [{ header: 'Fecha efectiva', key: 'fecha', type: 'date' }, { header: 'Recibo', key: 'recibo' }, { header: 'Cliente', key: 'cliente', width: 30 },
        { header: 'Contrato', key: 'contrato' }, { header: 'Terreno', key: 'terreno', width: 10 }, { header: 'Concepto', key: 'concepto', width: 20 }, { header: 'Capital recibido', key: 'capital', type: 'money' },
        { header: 'Interés recibido', key: 'interes', type: 'money' }, { header: 'Total recibido', key: 'total', type: 'money' }, { header: 'Forma de pago', key: 'forma', width: 16 }, { header: 'Referencia', key: 'ref', width: 18 }, { header: 'Registró', key: 'usr', width: 12 }],
        pays.map((p) => ({ fecha: p.effective_date, recibo: p.receipt_number, cliente: p.client_name, contrato: p.contract_number, terreno: p.lot_key, concepto: CONCEPT_LABEL[p.concept],
          capital: Number(p.capital), interes: Number(p.interest), total: Number(p.total), forma: METHOD_LABEL[p.method], ref: p.reference, usr: p.username })), ['capital', 'interes', 'total']);
      filename = `Cobranza_${r.tag}.xlsx`;
    } else if (kind === 'cobranza_mes') {
      const byM = new Map<string, any>();
      for (const p of pays) { const k = p.effective_date.slice(0, 7); const e = byM.get(k) ?? { mes: k, n: 0, capital: 0, interes: 0, total: 0, enganche: 0, mensual: 0 }; e.n++; e.capital += toCents(p.capital); e.interes += toCents(p.interest); e.total += toCents(p.total);
        if (['ENGANCHE', 'APARTADO'].includes(p.concept)) e.enganche += toCents(p.capital); else e.mensual += toCents(p.capital); byM.set(k, e); }
      addTableSheet(wb, 'Cobranza por mes', 'RESUMEN MENSUAL DE COBRANZA', sub, [{ header: 'Mes', key: 'mes', width: 10 }, { header: 'Operaciones', key: 'n', type: 'int' }, { header: 'Apartados y enganches', key: 'enganche', type: 'money' },
        { header: 'Aportaciones de capital', key: 'mensual', type: 'money' }, { header: 'Total de capital', key: 'capital', type: 'money' }, { header: 'Total de intereses', key: 'interes', type: 'money' }, { header: 'Total cobrado', key: 'total', type: 'money' }],
        [...byM.values()].map((e) => ({ ...e, capital: money(e.capital), interes: money(e.interes), total: money(e.total), enganche: money(e.enganche), mensual: money(e.mensual) })), ['n', 'enganche', 'mensual', 'capital', 'interes', 'total']);
      const byMethod = new Map<string, any>();
      for (const p of pays) { const e = byMethod.get(p.method) ?? { forma: METHOD_LABEL[p.method], n: 0, total: 0 }; e.n++; e.total += toCents(p.total); byMethod.set(p.method, e); }
      addTableSheet(wb, 'Por forma de pago', 'COBRANZA POR FORMA DE PAGO', sub, [{ header: 'Forma de pago', key: 'forma', width: 22 }, { header: 'Operaciones', key: 'n', type: 'int' }, { header: 'Total', key: 'total', type: 'money' }],
        [...byMethod.values()].map((e) => ({ ...e, total: money(e.total) })), ['n', 'total']);
      filename = `Cobranza_${r.tag}.xlsx`;
    } else {
      const ks = await contractsWithStatus({ client_id: params.client_id, lot: params.lot }, cfg, today, true);
      const pend = new Map(ks.map((k) => [k.id, k.capital_pending]));
      // saldo corrido por contrato
      const allPays = await listPayments({ client_id: params.client_id, status: 'CONFIRMADA', limit: 100000 });
      const running = new Map<number, number>();
      const priceBy = new Map(ks.map((k) => [k.id, toCents(k.price_agreed)]));
      const balAfter = new Map<number, number>();
      for (const p of allPays.slice().sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.id - b.id)) {
        const prev = running.get(p.contract_id) ?? priceBy.get(p.contract_id) ?? 0;
        const next = prev - toCents(p.capital); running.set(p.contract_id, next); balAfter.set(p.id, next);
      }
      addTableSheet(wb, 'Cobranza por cliente', 'COBRANZA POR CLIENTE', sub, [{ header: 'Cliente', key: 'cliente', width: 30 }, { header: 'Contrato', key: 'contrato' }, { header: 'Terreno', key: 'terreno', width: 10 },
        { header: 'Fecha', key: 'fecha', type: 'date' }, { header: 'Recibo', key: 'recibo' }, { header: 'Concepto', key: 'concepto', width: 20 }, { header: 'Capital', key: 'capital', type: 'money' }, { header: 'Interés', key: 'interes', type: 'money' },
        { header: 'Importe', key: 'importe', type: 'money' }, { header: 'Saldo después del pago', key: 'saldo', type: 'money' }, { header: 'Saldo pendiente actual', key: 'saldo_actual', type: 'money' }],
        pays.slice().sort((a, b) => a.client_name.localeCompare(b.client_name) || a.contract_number.localeCompare(b.contract_number) || a.effective_date.localeCompare(b.effective_date))
          .map((p) => ({ cliente: p.client_name, contrato: p.contract_number, terreno: p.lot_key, fecha: p.effective_date, recibo: p.receipt_number, concepto: CONCEPT_LABEL[p.concept],
            capital: Number(p.capital), interes: Number(p.interest), importe: Number(p.total), saldo: money(balAfter.get(p.id) ?? 0), saldo_actual: money(pend.get(p.contract_id) ?? 0) })), ['capital', 'interes', 'importe']);
      filename = `Cobranza_Clientes_${r.tag}.xlsx`;
    }
  }

  if (kind === 'cartera_vencida') {
    const { rows } = await overduePortfolio({ client_id: params.client_id, lot: params.lot, user_id: params.user_id });
    addTableSheet(wb, 'Cartera vencida', 'CARTERA VENCIDA', [cfg.nombre_proyecto, `Corte al ${fmtDate(today)}`, sub[2]], [{ header: 'Cliente', key: 'cliente', width: 30 }, { header: 'Teléfono', key: 'tel', width: 14 },
      { header: 'Terreno', key: 'terreno', width: 10 }, { header: 'Contrato', key: 'contrato' }, { header: 'Obligaciones vencidas', key: 'n', type: 'int' }, { header: 'Importe vencido', key: 'vencido', type: 'money' },
      { header: 'Días de atraso (máx.)', key: 'dias', type: 'int' }, { header: 'Próxima obligación', key: 'prox', type: 'date' }, { header: 'Importe próxima', key: 'prox_imp', type: 'money' },
      { header: 'Saldo de capital', key: 'saldo', type: 'money' }, { header: 'Estatus', key: 'estatus', width: 14 }],
      rows.map((k) => {
        const nextFuture = k.states.find((s) => s.balance > 0 && !s.override && !s.overdue);
        return { cliente: k.client_name, tel: k.phone, terreno: k.lot_key, contrato: k.contract_number, n: k.overdue_count, vencido: money(k.overdue_amount), dias: k.max_days_late,
          prox: nextFuture?.due_date ?? null, prox_imp: nextFuture ? money(nextFuture.balance) : null, saldo: money(k.capital_pending), estatus: COLLECTION_LABEL[k.collection] };
      }), ['n', 'vencido', 'saldo']);
    filename = `Cartera_Vencida_${today}.xlsx`;
  }

  if (kind === 'inventario') {
    const lots = await listLots({ status: params.status, q: params.lot });
    addTableSheet(wb, 'Inventario', 'INVENTARIO DE TERRENOS', [cfg.nombre_proyecto, `Corte al ${fmtDate(today)}`, sub[2]], [{ header: 'Terreno', key: 'lote', width: 10 }, { header: 'Manzana', key: 'mz', width: 9 },
      { header: 'Superficie m²', key: 'm2', width: 12 }, { header: 'Precio contado', key: 'contado', type: 'money' }, { header: 'Precio 36 meses', key: 'p36', type: 'money' }, { header: 'Enganche 36', key: 'e36', type: 'money' },
      { header: 'Mensualidad 36', key: 'm36', type: 'money' }, { header: 'Precio 48 meses', key: 'p48', type: 'money' }, { header: 'Enganche 48', key: 'e48', type: 'money' }, { header: 'Mensualidad 48', key: 'm48', type: 'money' },
      { header: 'Planes disponibles', key: 'planes', width: 20 }, { header: 'Estatus', key: 'estatus', width: 12 }, { header: 'Cliente', key: 'cliente', width: 30 }, { header: 'Contrato', key: 'contrato' }],
      lots.map((l) => ({ lote: l.lot_key, mz: l.block, m2: l.area_m2 === null ? null : Number(l.area_m2), contado: l.price_cash && Number(l.price_cash), p36: l.price_36 && Number(l.price_36), e36: l.down_36 && Number(l.down_36),
        m36: l.monthly_36 && Number(l.monthly_36), p48: l.price_48 && Number(l.price_48), e48: l.down_48 && Number(l.down_48), m48: l.monthly_48 && Number(l.monthly_48),
        planes: [l.price_cash && 'Contado', l.price_36 && '36', l.price_48 && '48'].filter(Boolean).join(', '), estatus: LOT_STATUS_LABEL[l.status as keyof typeof LOT_STATUS_LABEL],
        cliente: l.client_name, contrato: l.contract_number })));
    filename = `Inventario_Terrenos_${today}.xlsx`;
  }

  if (kind === 'estado_cuenta') {
    let id = params.contract_id;
    if (!id && params.contract) id = (await q<any>('SELECT id FROM contracts WHERE upper(contract_number)=$1', [params.contract.toUpperCase()]))[0]?.id;
    if (!id) throw badRequest('Seleccione el contrato.');
    const s = await contractSummary(id);
    buildStatementSheets(wb, s, cfg.nombre_proyecto, sub[2]);
    filename = `Estado_Cuenta_${s.contract.contract_number}_${today}.xlsx`;
  }

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  await audit(pool(), user, 'EXPORTACION', { entity: 'reporte', entityId: kind, after: { reporte: def.title, archivo: filename, filtros: params }, ip });
  return { buf, filename };
}

export function buildStatementSheets(wb: ExcelJS.Workbook, s: Awaited<ReturnType<typeof contractSummary>>, project: string, generated: string) {
  const k = s.contract; const t = s.totals;
  const ws = wb.addWorksheet('Estado de cuenta');
  ws.addRow(['ESTADO DE CUENTA']).font = { bold: true, size: 14, color: { argb: 'FF1B3328' } };
  ws.addRow([project]); ws.addRow([generated]); ws.addRow([]);
  const kv = (a: string, b: any, isMoney = false) => { const r = ws.addRow([a, b]); r.getCell(1).font = { bold: true }; if (isMoney) r.getCell(2).numFmt = '"$"#,##0.00'; };
  kv('Cliente', k.client_name); kv('Contrato', k.contract_number); kv('Terreno', k.lot_key); kv('Fecha de contrato', fmtDate(k.contract_date));
  kv('Plan de financiamiento', PLAN_LABEL[k.plan]); kv('Estatus', COLLECTION_LABEL[s.status]); ws.addRow([]);
  ws.addRow(['RESUMEN FINANCIERO']).font = { bold: true };
  kv('Precio total', money(t.price), true); kv('Apartado registrado', money(t.apartado), true); kv('Enganche recibido', money(t.enganche), true);
  kv('Aportaciones de capital recibidas', money(t.aportaciones_capital), true); kv('Intereses cobrados', money(t.interest), true); kv('Total histórico recibido', money(t.total_received), true);
  kv('Capital pendiente', money(t.capital_pending), true); kv('Intereses pendientes', money(t.interest_pending), true); kv('Total actualizado pendiente', money(t.total_pending), true);
  kv('Aportaciones programadas', t.n_scheduled); kv('Aportaciones cubiertas', t.n_covered); kv('Aportaciones pendientes', t.n_pending); kv('Aportaciones vencidas', t.n_overdue);
  kv('Próxima fecha de pago', t.next_due ? fmtDate(t.next_due) : '—');
  ws.getColumn(1).width = 34; ws.getColumn(2).width = 22;
  const ok = s.payments.filter((p: any) => p.status === 'CONFIRMADA');
  addTableSheet(wb, 'Historial', 'HISTORIAL DE OPERACIONES CONFIRMADAS', [k.contract_number + ' — ' + k.client_name], [
    { header: 'Fecha', key: 'fecha', type: 'date' }, { header: 'Recibo', key: 'recibo' }, { header: 'Concepto', key: 'concepto', width: 20 }, { header: 'No. aportación', key: 'num', width: 10 },
    { header: 'Capital', key: 'capital', type: 'money' }, { header: 'Interés', key: 'interes', type: 'money' }, { header: 'Total recibido', key: 'total', type: 'money' }, { header: 'Forma de pago', key: 'forma', width: 16 }, { header: 'Referencia', key: 'ref', width: 18 }],
    ok.map((p: any) => ({ fecha: p.effective_date, recibo: p.receipt_number, concepto: CONCEPT_LABEL[p.concept], num: p.scheduled_number ?? '', capital: Number(p.capital), interes: Number(p.interest), total: Number(p.total), forma: METHOD_LABEL[p.method], ref: p.reference })),
    ['capital', 'interes', 'total']);
  addTableSheet(wb, 'Calendario', 'CALENDARIO DE APORTACIONES', [k.contract_number], [
    { header: 'Tipo', key: 'tipo', width: 12 }, { header: 'No.', key: 'num', width: 6 }, { header: 'Vencimiento', key: 'venc', type: 'date' }, { header: 'Programado', key: 'prog', type: 'money' },
    { header: 'Pagado', key: 'pag', type: 'money' }, { header: 'Saldo', key: 'saldo', type: 'money' }, { header: 'Fecha real de pago', key: 'fpago', type: 'date' }, { header: 'Días de atraso', key: 'dias', type: 'int' }, { header: 'Estatus', key: 'st', width: 18 }],
    s.states.map((x) => ({ tipo: x.kind === 'MENSUAL' ? 'Aportación' : x.kind === 'ENGANCHE' ? 'Enganche' : 'Apartado', num: x.number || '', venc: x.due_date, prog: money(x.amount), pag: money(x.paid), saldo: money(x.balance),
      fpago: x.paid_date, dias: x.days_late, st: ITEM_STATUS_LABEL[x.status] })), ['prog', 'pag', 'saldo']);
}
