import { q, one, tx, pool, Db } from './db';
import { hashPassword, verifyPassword, randomToken, sha256, passwordProblem } from './crypto';
import { effectivePerms, Perm, Role } from './permissions';
import { getConfig } from './config';
import { audit } from './audit';
import { AppError, badRequest } from './errors';

export const SESSION_COOKIE = 'cc_session';

export type CurrentUser = {
  id: number; username: string; full_name: string; email: string | null; role: Role;
  perms: Set<Perm>; must_change_password: boolean; sessionId: string;
};

let dummyHash: Promise<string> | null = null;

export async function login(username: string, password: string, ip: string | null, ua: string | null) {
  const cfg = await getConfig();
  const uname = String(username || '').trim().toLowerCase();
  // Límite por IP: 30 intentos fallidos en 15 minutos
  if (ip) {
    const r = await one<{ n: number }>(`SELECT count(*) n FROM login_attempts WHERE ip=$1 AND NOT success AND at > now() - interval '15 minutes'`, [ip]);
    if ((r?.n ?? 0) >= 30) throw new AppError(429, 'Demasiados intentos desde esta conexión. Intente más tarde.');
  }
  const u = await one<any>('SELECT * FROM users WHERE lower(username)=$1', [uname]);
  const fail = async (msg = 'Usuario o contraseña incorrectos.') => {
    await q('INSERT INTO login_attempts(username, ip, success) VALUES ($1,$2,false)', [uname, ip]);
    if (u) {
      const attempts = u.failed_attempts + 1;
      const lock = attempts >= cfg.max_intentos_login;
      await q(`UPDATE users SET failed_attempts=$2, locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE locked_until END WHERE id=$1`,
        [u.id, lock ? 0 : attempts, lock, String(cfg.minutos_bloqueo_login)]);
      await audit(pool(), { id: u.id, username: u.username }, lock ? 'LOGIN_BLOQUEO' : 'LOGIN_FALLIDO', { entity: 'usuario', entityId: u.id, ip });
    }
    throw new AppError(401, msg);
  };
  if (!u) { dummyHash ??= hashPassword('dummy-password-123'); await verifyPassword(await dummyHash, password); return fail(); }
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw new AppError(423, 'La cuenta está bloqueada temporalmente por intentos fallidos. Intente más tarde.');
  const ok = await verifyPassword(u.password_hash, password);
  if (!ok) return fail();
  if (!u.is_active) { await q('INSERT INTO login_attempts(username, ip, success) VALUES ($1,$2,false)', [uname, ip]); throw new AppError(403, 'La cuenta está desactivada. Contacte al administrador.'); }
  const token = randomToken();
  const s = await tx(async (c) => {
    const s = await one<{ id: string; expires_at: Date }>(
      `INSERT INTO sessions(user_id, token_hash, expires_at, ip, user_agent) VALUES ($1,$2, now() + ($3 || ' hours')::interval, $4, $5) RETURNING id, expires_at`,
      [u.id, sha256(token), String(cfg.horas_sesion), ip, ua?.slice(0, 300) ?? null], c);
    await q('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [u.id], c);
    await q('INSERT INTO login_attempts(username, ip, success) VALUES ($1,$2,true)', [uname, ip], c);
    await audit(c, { id: u.id, username: u.username }, 'LOGIN', { entity: 'usuario', entityId: u.id, ip });
    return s!;
  });
  return { token, expires: s.expires_at, mustChange: u.must_change_password as boolean };
}

export async function userFromToken(token: string | undefined | null): Promise<CurrentUser | null> {
  if (!token) return null;
  const r = await one<any>(
    `SELECT s.id sid, s.last_seen_at, u.* FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active`, [sha256(token)]);
  if (!r) return null;
  if (Date.now() - new Date(r.last_seen_at).getTime() > 5 * 60_000) {
    await q('UPDATE sessions SET last_seen_at=now() WHERE id=$1', [r.sid]);
  }
  return {
    id: r.id, username: r.username, full_name: r.full_name, email: r.email, role: r.role,
    perms: effectivePerms(r.role, r.extra_permissions, r.revoked_permissions),
    must_change_password: r.must_change_password, sessionId: r.sid,
  };
}

export async function logout(token: string | undefined, user: CurrentUser | null, ip: string | null) {
  if (!token) return;
  await q('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha256(token)]);
  if (user) await audit(pool(), user, 'LOGOUT', { entity: 'usuario', entityId: user.id, ip });
}

export async function changeOwnPassword(user: CurrentUser, current: string, next: string, ip: string | null) {
  const u = await one<any>('SELECT password_hash FROM users WHERE id=$1', [user.id]);
  if (!u || !(await verifyPassword(u.password_hash, current))) throw badRequest('La contraseña actual no es correcta.');
  const p = passwordProblem(next); if (p) throw badRequest(p);
  if (current === next) throw badRequest('La nueva contraseña debe ser distinta de la actual.');
  const h = await hashPassword(next);
  await tx(async (c) => {
    await q('UPDATE users SET password_hash=$2, must_change_password=false, password_changed_at=now(), updated_at=now() WHERE id=$1', [user.id, h], c);
    await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL', [user.id, user.sessionId], c);
    await audit(c, user, 'CAMBIO_CONTRASENA', { entity: 'usuario', entityId: user.id, ip });
  });
}

/** Crea un enlace de un solo uso (1 hora) para restablecer contraseña. Devuelve el token en claro. */
export async function createResetToken(db: Db, userId: number, createdBy: number | null): Promise<string> {
  const token = randomToken();
  await q('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [userId], db);
  await q(`INSERT INTO password_resets(user_id, token_hash, expires_at, created_by) VALUES ($1,$2, now() + interval '1 hour', $3)`, [userId, sha256(token), createdBy], db);
  return token;
}

export async function resetPasswordWithToken(token: string, next: string, ip: string | null) {
  const p = passwordProblem(next); if (p) throw badRequest(p);
  const h = await hashPassword(next);
  await tx(async (c) => {
    const r = await one<any>(`SELECT pr.id, pr.user_id, u.username FROM password_resets pr JOIN users u ON u.id=pr.user_id
      WHERE pr.token_hash=$1 AND pr.used_at IS NULL AND pr.expires_at > now() AND u.is_active FOR UPDATE OF pr`, [sha256(String(token))], c);
    if (!r) throw badRequest('El enlace no es válido o ya expiró. Solicite uno nuevo.');
    await q('UPDATE password_resets SET used_at=now() WHERE id=$1', [r.id], c);
    await q('UPDATE users SET password_hash=$2, must_change_password=false, failed_attempts=0, locked_until=NULL, password_changed_at=now(), updated_at=now() WHERE id=$1', [r.user_id, h], c);
    await q('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [r.user_id], c);
    await audit(c, { id: r.user_id, username: r.username }, 'RESTABLECER_CONTRASENA', { entity: 'usuario', entityId: r.user_id, ip });
  });
}
