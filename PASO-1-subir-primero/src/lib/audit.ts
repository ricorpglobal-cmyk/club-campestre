import { Db, q } from './db';
export type AuditUser = { id: number; username: string } | null;

export async function audit(db: Db, user: AuditUser, action: string, opts: {
  entity?: string; entityId?: string | number; before?: unknown; after?: unknown; reason?: string | null; ip?: string | null;
} = {}) {
  await q(
    `INSERT INTO audit_log(user_id, username, action, entity, entity_id, before, after, reason, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [user?.id ?? null, user?.username ?? null, action, opts.entity ?? null,
     opts.entityId != null ? String(opts.entityId) : null,
     opts.before != null ? JSON.stringify(opts.before) : null,
     opts.after != null ? JSON.stringify(opts.after) : null,
     opts.reason ?? null, opts.ip ?? null], db);
}
