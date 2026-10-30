import { z } from 'zod';
import { q, one, tx, pool } from '../db';
import { audit } from '../audit';
import { CurrentUser, createResetToken } from '../auth';
import { hashPassword, passwordProblem, randomToken } from '../crypto';
import { ADMIN_ONLY, ALL_PERMS, Perm } from '../permissions';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { mailConfigured, sendMail } from '../mail';

const permList = z.array(z.string()).optional().default([]).transform((a) => a.filter((p) => (ALL_PERMS as string[]).includes(p)));
export const userSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Usuario de 3 a 40 caracteres: letras, números, punto, guion'),
  full_name: z.string().trim().min(3).max(120),
  email: z.string().trim().toLowerCase().max(200).optional().nullable().transform((v) => (v ? v : null)).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Correo inválido'),
  role: z.enum(['ADMINISTRADOR', 'VENTAS', 'COBRANZA', 'CONSULTA']),
  extra_permissions: permList, revoked_permissions: permList,
  is_active: z.boolean().optional().default(true),
  password: z.string().optional().nullable(),
});

const PUBLIC = 'id, username, full_name, email, role, extra_permissions, revoked_permissions, is_active, must_change_password, last_login_at, locked_until, created_at';

export async function listUsers() {
  return q<any>(`SELECT ${PUBLIC}, (SELECT count(*) FROM sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>now()) open_sessions FROM users u ORDER BY is_active DESC, full_name`);
}

function cleanPerms(role: string, extra: string[]) {
  return role === 'ADMINISTRADOR' ? [] : extra.filter((p) => !ADMIN_ONLY.includes(p as Perm));
}

export async function createUser(input: z.input<typeof userSchema>, admin: CurrentUser, ip: string | null) {
  const d = userSchema.parse(input);
  const temp = d.password || `${randomToken(9)}9a`;
  const prob = passwordProblem(temp); if (prob) throw badRequest(prob);
  const h = await hashPassword(temp);
  return tx(async (c) => {
    const u = await one<any>(`INSERT INTO users(username, full_name, email, password_hash, role, extra_permissions, revoked_permissions, is_active, must_change_password)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING ${PUBLIC}`, [d.username, d.full_name, d.email, h, d.role, cleanPerms(d.role, d.extra_permissions), d.revoked_permissions, d.is_active], c);
    await audit(c, admin, 'ALTA_USUARIO', { entity: 'usuario', entityId: u.id, after: { username: d.username, role: d.role, activo: d.is_active, extra: d.extra_permissions, revocados: d.revoked_permissions }, ip });
    return { user: u, temporaryPassword: temp };
  });
}

export async function updateUser(id: number, input: Partial<z.input<typeof userSchema>>, admin: CurrentUser, ip: string | null) {
  return tx(async (c) => {
    const cur = await one<any>(`SELECT ${PUBLIC} FROM users WHERE id=$1 FOR UPDATE`, [id], c);
    if (!cur) throw notFound('Usuario no encontrado.');
    const d = userSchema.partial().parse(input);
    const role = d.role ?? cur.role; const active = d.is_active ?? cur.is_active;
    if (id === admin.id && (role !== cur.role || !active || (d.revoked_permissions && d.revoked_permissions.length)))
      throw forbidden('No puede cambiar su propio rol, permisos o desactivar su propia cuenta.');
    if (cur.role === 'ADMINISTRADOR' && (role !== 'ADMINISTRADOR' || !active)) {
      const n = await one<{ n: number }>(`SELECT count(*) n FROM users WHERE role='ADMINISTRADOR' AND is_active AND id<>$1`, [id], c);
      if (!n!.n) throw conflict('Debe existir al menos un administrador activo.');
    }
    const next = {
      full_name: d.full_name ?? cur.full_name, email: d.email === undefined ? cur.email : d.email, role,
      extra_permissions: cleanPerms(role, d.extra_permissions ?? cur.extra_permissions), revoked_permissions: d.revoked_permissions ?? cur.revoked_permissions, is_active: active,
    };
    await q(`UPDATE users SET full_name=$2, email=$3, role=$4, extra_permissions=$5, revoked_permissions=$6, is_active=$7, updated_at=now() WHERE id=$1`,
      [id, next.full_name, next.email, next.role, next.extra_permissions, next.revoked_permissions, next.is_active], c);
    if (!active || role !== cur.role) await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id], c);
    const permsChanged = role !== cur.role || JSON.stringify(next.extra_permissions) !== JSON.stringify(cur.extra_permissions) || JSON.stringify(next.revoked_permissions) !== JSON.stringify(cur.revoked_permissions);
    await audit(c, admin, permsChanged ? 'CAMBIO_PERMISOS' : active !== cur.is_active ? (active ? 'ACTIVACION_USUARIO' : 'DESACTIVACION_USUARIO') : 'MODIFICACION_USUARIO', {
      entity: 'usuario', entityId: id, ip,
      before: { role: cur.role, activo: cur.is_active, extra: cur.extra_permissions, revocados: cur.revoked_permissions, email: cur.email },
      after: { role, activo: active, extra: next.extra_permissions, revocados: next.revoked_permissions, email: next.email } });
  });
}

export async function adminResetLink(id: number, admin: CurrentUser, ip: string | null, baseUrl: string) {
  return tx(async (c) => {
    const u = await one<any>('SELECT id, username, email, is_active FROM users WHERE id=$1', [id], c);
    if (!u) throw notFound('Usuario no encontrado.');
    if (!u.is_active) throw conflict('La cuenta está desactivada.');
    const token = await createResetToken(c, id, admin.id);
    await q('UPDATE users SET locked_until=NULL, failed_attempts=0 WHERE id=$1', [id], c);
    await audit(c, admin, 'ENLACE_RESTABLECIMIENTO', { entity: 'usuario', entityId: id, ip });
    return { url: `${baseUrl.replace(/\/$/, '')}/restablecer?token=${token}`, expiresInMinutes: 60 };
  });
}

/** Recuperación por correo. Responde siempre igual para no revelar si el usuario existe. */
export async function requestRecovery(identifier: string, ip: string | null, baseUrl: string) {
  const id = String(identifier || '').trim().toLowerCase();
  if (!id || !mailConfigured()) return { sent: false, mailConfigured: mailConfigured() };
  const recent = await one<{ n: number }>(`SELECT count(*) n FROM password_resets pr JOIN users u ON u.id=pr.user_id WHERE (lower(u.username)=$1 OR lower(u.email)=$1) AND pr.created_at > now() - interval '15 minutes'`, [id]);
  if ((recent?.n ?? 0) >= 3) return { sent: true, mailConfigured: true };
  const u = await one<any>('SELECT id, username, email FROM users WHERE (lower(username)=$1 OR lower(email)=$1) AND is_active AND email IS NOT NULL', [id]);
  if (u) {
    const token = await createResetToken(pool(), u.id, null);
    await sendMail(u.email, 'Club Campestre — restablecer contraseña',
      `Hola,\n\nPara restablecer su contraseña abra este enlace (válido por 1 hora):\n${baseUrl.replace(/\/$/, '')}/restablecer?token=${token}\n\nSi usted no lo solicitó, ignore este mensaje.`);
    await audit(pool(), { id: u.id, username: u.username }, 'SOLICITUD_RECUPERACION', { entity: 'usuario', entityId: u.id, ip });
  }
  return { sent: true, mailConfigured: true };
}

export async function listSessions(userId?: number) {
  return q<any>(`SELECT s.id, s.user_id, u.username, s.created_at, s.last_seen_at, s.expires_at, s.ip, s.user_agent FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.revoked_at IS NULL AND s.expires_at > now() ${userId ? 'AND s.user_id=$1' : ''} ORDER BY s.last_seen_at DESC`, userId ? [userId] : []);
}

export async function revokeSession(sessionId: string, actor: CurrentUser, ip: string | null) {
  const s = await one<any>('SELECT user_id FROM sessions WHERE id=$1', [sessionId]);
  if (!s) throw notFound('Sesión no encontrada.');
  if (s.user_id !== actor.id && !actor.perms.has('usuarios.administrar')) throw forbidden();
  await q('UPDATE sessions SET revoked_at=now() WHERE id=$1', [sessionId]);
  await audit(pool(), actor, 'CIERRE_SESION_REMOTO', { entity: 'usuario', entityId: s.user_id, ip });
}
