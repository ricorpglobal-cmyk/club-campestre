import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/lib/api';
import { login, SESSION_COOKIE } from '@/lib/auth';

const secure = () => process.env.ALLOW_INSECURE_COOKIES !== 'true';
export const POST = api({ public: true }, async ({ req, ip }) => {
  const b = z.object({ username: z.string().max(60), password: z.string().max(200) }).parse(await req.json());
  const r = await login(b.username, b.password, ip, req.headers.get('user-agent'));
  const res = NextResponse.json({ ok: true, mustChange: r.mustChange });
  res.cookies.set(SESSION_COOKIE, r.token, { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', expires: new Date(r.expires) });
  return res;
});
