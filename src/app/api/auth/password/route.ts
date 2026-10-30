import { z } from 'zod';
import { api } from '@/lib/api';
import { changeOwnPassword } from '@/lib/auth';
export const POST = api({ allowMustChange: true }, async ({ req, user, ip }) => {
  const b = z.object({ current: z.string(), next: z.string() }).parse(await req.json());
  await changeOwnPassword(user, b.current, b.next, ip);
  return { ok: true };
});
