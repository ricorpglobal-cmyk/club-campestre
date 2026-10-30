import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, userFromToken, CurrentUser } from './auth';
import { Perm } from './permissions';

export async function currentUser(): Promise<CurrentUser | null> {
  const c = await cookies();
  return userFromToken(c.get(SESSION_COOKIE)?.value);
}

/** Para páginas: exige sesión (y permiso); redirige si no se cumple. */
export async function requirePage(perm?: Perm | Perm[]): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (u.must_change_password) redirect('/cambiar-contrasena');
  if (perm) {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => u.perms.has(p))) redirect('/sin-permiso');
  }
  return u;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0].trim()) || h.get('x-real-ip') || null;
}
