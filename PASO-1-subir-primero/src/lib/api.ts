import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { SESSION_COOKIE, userFromToken, CurrentUser } from './auth';
import { Perm } from './permissions';
import { AppError, mapDbError } from './errors';

export type Ctx = { req: NextRequest; user: CurrentUser; params: Record<string, string>; ip: string | null };

type Opts = { perm?: Perm | Perm[] | null; allowMustChange?: boolean; public?: boolean };

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    return new URL(origin).host === host;
  } catch { return false; }
}

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json({ error: 'Datos inválidos: ' + e.issues.map((i) => `${i.path.join('.') || 'dato'}: ${i.message}`).join('; ') }, { status: 400 });
  }
  const mapped = e instanceof AppError ? e : mapDbError(e);
  if (mapped) return NextResponse.json({ error: mapped.message, details: mapped.details }, { status: mapped.status });
  console.error('[ERROR]', e instanceof Error ? e.message : e);
  return NextResponse.json({ error: 'Ocurrió un error inesperado. Si persiste, contacte al administrador.' }, { status: 500 });
}

/** Envoltura de endpoints: valida origen, sesión y permisos EN EL SERVIDOR. */
export function api(opts: Opts, fn: (ctx: Ctx) => Promise<unknown>) {
  return async (req: NextRequest, route: { params: Promise<Record<string, string>> }) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) {
        return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403 });
      }
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
      const params = (await route?.params) ?? {};
      let user: CurrentUser | null = null;
      if (!opts.public) {
        user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
        if (!user) return NextResponse.json({ error: 'Sesión no válida o expirada.' }, { status: 401 });
        if (user.must_change_password && !opts.allowMustChange) return NextResponse.json({ error: 'Debe cambiar su contraseña antes de continuar.' }, { status: 403 });
        if (opts.perm) {
          const list = Array.isArray(opts.perm) ? opts.perm : [opts.perm];
          if (!list.some((p) => user!.perms.has(p))) return NextResponse.json({ error: 'No tiene permiso para realizar esta operación.' }, { status: 403 });
        }
      }
      const out = await fn({ req, user: user as CurrentUser, params, ip });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function need(user: CurrentUser, p: Perm) {
  if (!user.perms.has(p)) throw new AppError(403, 'No tiene permiso para realizar esta operación.');
}

export function fileResponse(buf: Buffer | Uint8Array, filename: string, mime: string, inline = false) {
  return new Response(buf as any, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/[^\w.\-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
