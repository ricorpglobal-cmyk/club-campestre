import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { q, one, tx, Db, pool } from '../db';
import { audit, AuditUser } from '../audit';
import { badRequest, notFound } from '../errors';
import { getConfig, nextFolio } from '../config';
import { putObject, sniffMime, getObject } from '../storage';
import { sha256 } from '../crypto';

const opt = z.string().trim().max(200).optional().nullable().transform((v) => (v ? v : null));
export const clientSchema = z.object({
  full_name: z.string().trim().min(3, 'Nombre completo requerido').max(200),
  phone: opt, phone2: opt,
  email: z.string().trim().max(200).optional().nullable().transform((v) => (v ? v : null)).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Correo inválido'),
  street: opt, ext_no: opt, int_no: opt, colony: opt, municipality: opt, state: opt,
  zip: z.string().trim().optional().nullable().transform((v) => (v ? v : null)).refine((v) => !v || /^\d{5}$/.test(v), 'Código postal de 5 dígitos'),
  rfc: z.string().trim().toUpperCase().optional().nullable().transform((v) => (v ? v : null))
    .refine((v) => !v || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v), 'RFC con formato inválido'),
  fiscal_doc_received_at: z.string().optional().nullable().transform((v) => (v ? v : null)),
  fiscal_doc_status: z.enum(['SIN_DOCUMENTO', 'RECIBIDO', 'VALIDADO', 'RECHAZADO']).optional().default('SIN_DOCUMENTO'),
  fiscal_notes: opt, notes: z.string().trim().max(2000).optional().nullable().transform((v) => (v ? v : null)),
});
export type ClientInput = z.infer<typeof clientSchema>;
const FISCAL = ['rfc', 'fiscal_doc_received_at', 'fiscal_doc_status', 'fiscal_notes'] as const;
const COLS = ['full_name', 'phone', 'phone2', 'email', 'street', 'ext_no', 'int_no', 'colony', 'municipality', 'state', 'zip', 'rfc', 'fiscal_doc_received_at', 'fiscal_doc_status', 'fiscal_notes', 'notes'] as const;

/** Oculta la información fiscal a quien no tiene el permiso. */
export function redact<T extends Record<string, any>>(c: T, canFiscal: boolean): T {
  if (canFiscal) return c;
  const o: any = { ...c };
  for (const f of FISCAL) if (f in o) o[f] = f === 'rfc' && o.rfc ? '••••••••••' : null;
  return o;
}

export async function createClient(db: Db, input: ClientInput, user: AuditUser, ip: string | null, canFiscal: boolean) {
  const d = clientSchema.parse(input);
  if (!canFiscal) for (const f of FISCAL) (d as any)[f] = f === 'fiscal_doc_status' ? 'SIN_DOCUMENTO' : null;
  const cfg = await getConfig(db);
  const code = (await nextFolio(db, 'cliente', cfg.prefijo_cliente, 0, 5)).replace('-0-', '-');
  const r = await one<any>(`INSERT INTO clients(code, ${COLS.join(',')}, created_by) VALUES ($1, ${COLS.map((_, i) => `$${i + 2}`).join(',')}, $${COLS.length + 2}) RETURNING *`,
    [code, ...COLS.map((c) => (d as any)[c] ?? null), user?.id ?? null], db);
  await audit(db, user, 'ALTA_CLIENTE', { entity: 'cliente', entityId: r.id, after: { code, full_name: d.full_name }, ip });
  return r;
}

export async function updateClient(id: number, input: ClientInput, user: AuditUser, ip: string | null, canFiscal: boolean) {
  const d = clientSchema.parse(input);
  return tx(async (c) => {
    const cur = await one<any>('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [id], c);
    if (!cur) throw notFound('Cliente no encontrado.');
    const cols = COLS.filter((k) => canFiscal || !(FISCAL as readonly string[]).includes(k));
    const before: any = {}; const after: any = {};
    for (const k of cols) { const nv = (d as any)[k] ?? null; const ov = cur[k] ?? null; if (String(nv ?? '') !== String(ov ?? '')) { before[k] = ov; after[k] = nv; } }
    if (!Object.keys(after).length) return cur;
    await q(`UPDATE clients SET ${cols.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now() WHERE id=$1`, [id, ...cols.map((k) => (d as any)[k] ?? null)], c);
    await audit(c, user, 'MODIFICACION_CLIENTE', { entity: 'cliente', entityId: id, before: redact(before, canFiscal), after: redact(after, canFiscal), ip });
    return { ...cur, ...after };
  });
}

export async function searchClients(term: string | undefined, canFiscal: boolean, limit = 100) {
  const p: unknown[] = []; let w = '';
  if (term?.trim()) {
    const t = term.trim();
    p.push(`%${t.toLowerCase()}%`, t.replace(/\D/g, '') ? `%${t.replace(/\D/g, '')}%` : '__none__', t.toUpperCase());
    w = `WHERE lower(c.full_name) LIKE $1 OR regexp_replace(coalesce(c.phone,'')||' '||coalesce(c.phone2,''),'\\D','','g') LIKE $2 OR upper(c.code) = $3
         OR EXISTS (SELECT 1 FROM contracts k JOIN lots l ON l.id=k.lot_id WHERE k.client_id=c.id AND (upper(l.lot_key)=$3 OR upper(l.lot_number)=$3 OR upper(k.contract_number)=$3))
         ${canFiscal ? 'OR upper(c.rfc) = $3' : ''}`;
  }
  p.push(limit);
  const rows = await q<any>(`SELECT c.*, (SELECT string_agg(l.lot_key, ', ' ORDER BY l.lot_key) FROM contracts k JOIN lots l ON l.id=k.lot_id WHERE k.client_id=c.id AND k.status<>'CANCELADO') lots
    FROM clients c ${w} ORDER BY c.full_name LIMIT $${p.length}`, p);
  return rows.map((r) => redact(r, canFiscal));
}

export async function getClient(id: number, canFiscal: boolean) {
  const c = await one<any>('SELECT c.*, u.username created_by_name FROM clients c LEFT JOIN users u ON u.id=c.created_by WHERE c.id=$1', [id]);
  if (!c) throw notFound('Cliente no encontrado.');
  const docs = canFiscal ? await q<any>(`SELECT d.id, d.doc_type, d.original_name, d.mime_type, d.size_bytes, d.uploaded_at, u.username FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by
    WHERE d.client_id=$1 AND d.archived_at IS NULL ORDER BY d.uploaded_at DESC`, [id]) : [];
  const history = await q<any>(`SELECT at, username, action, before, after, reason FROM audit_log WHERE entity='cliente' AND entity_id=$1 ORDER BY at DESC LIMIT 50`, [String(id)]);
  return { client: redact(c, canFiscal), docs, history: canFiscal ? history : history.map((h) => ({ ...h, before: h.before && redact(h.before, false), after: h.after && redact(h.after, false) })) };
}

export async function uploadDocument(opts: { clientId?: number | null; contractId?: number | null; docType: string; filename: string; buf: Buffer }, user: AuditUser, ip: string | null) {
  if (opts.buf.length > 10 * 1024 * 1024) throw badRequest('El documento excede 10 MB.');
  const mime = sniffMime(opts.buf);
  if (!mime) throw badRequest('Sólo se admiten documentos PDF, JPG o PNG.');
  if (!['CONSTANCIA_FISCAL', 'CONTRATO', 'IDENTIFICACION', 'OTRO'].includes(opts.docType)) throw badRequest('Tipo de documento inválido.');
  const id = randomUUID();
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  const key = `docs/${opts.clientId ? `clientes/${opts.clientId}` : `contratos/${opts.contractId}`}/${id}.${ext}`;
  await putObject(key, opts.buf, mime);
  return tx(async (c) => {
    if (opts.clientId && !(await one('SELECT 1 FROM clients WHERE id=$1', [opts.clientId], c))) throw notFound('Cliente no encontrado.');
    if (opts.contractId && !(await one('SELECT 1 FROM contracts WHERE id=$1', [opts.contractId], c))) throw notFound('Contrato no encontrado.');
    await q(`INSERT INTO documents(id, client_id, contract_id, doc_type, original_name, mime_type, size_bytes, sha256, storage_key, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, opts.clientId ?? null, opts.contractId ?? null, opts.docType, opts.filename.slice(0, 200), mime, opts.buf.length, sha256(opts.buf), key, user?.id ?? null], c);
    if (opts.clientId && opts.docType === 'CONSTANCIA_FISCAL') {
      await q(`UPDATE clients SET fiscal_doc_status = CASE WHEN fiscal_doc_status='SIN_DOCUMENTO' THEN 'RECIBIDO' ELSE fiscal_doc_status END,
        fiscal_doc_received_at = coalesce(fiscal_doc_received_at, (now() AT TIME ZONE 'America/Mexico_City')::date) WHERE id=$1`, [opts.clientId], c);
    }
    await audit(c, user, 'CARGA_DOCUMENTO', { entity: opts.clientId ? 'cliente' : 'contrato', entityId: opts.clientId ?? opts.contractId!, after: { documento: id, tipo: opts.docType, archivo: opts.filename }, ip });
    return { id };
  });
}

export async function readDocument(id: string, user: AuditUser, ip: string | null) {
  const d = await one<any>('SELECT * FROM documents WHERE id=$1 AND archived_at IS NULL', [id]);
  if (!d) throw notFound('Documento no encontrado.');
  const buf = await getObject(d.storage_key);
  await audit(pool(), user, 'CONSULTA_DOCUMENTO', { entity: d.client_id ? 'cliente' : 'contrato', entityId: d.client_id ?? d.contract_id, after: { documento: id, tipo: d.doc_type }, ip });
  return { doc: d, buf };
}
