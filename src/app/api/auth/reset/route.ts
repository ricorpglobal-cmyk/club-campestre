import { z } from 'zod';
import { api } from '@/lib/api';
import { resetPasswordWithToken } from '@/lib/auth';
export const POST = api({ public: true }, async ({ req, ip }) => {
  const b = z.object({ token: z.string().min(10).max(200), password: z.string() }).parse(await req.json());
  await resetPasswordWithToken(b.token, b.password, ip);
  return { ok: true };
});
