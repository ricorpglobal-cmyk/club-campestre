import { NextRequest, NextResponse } from 'next/server';
import { logout, SESSION_COOKIE, userFromToken } from '@/lib/auth';
export async function POST(req: NextRequest) {
  const t = req.cookies.get(SESSION_COOKIE)?.value;
  const u = await userFromToken(t).catch(() => null);
  await logout(t, u, req.headers.get('x-forwarded-for')?.split(',')[0] ?? null).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
