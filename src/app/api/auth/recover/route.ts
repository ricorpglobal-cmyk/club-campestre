import { z } from 'zod';
import { api } from '@/lib/api';
import { requestRecovery } from '@/lib/services/users';
export const POST = api({ public: true }, async ({ req, ip }) => {
  const b = z.object({ identifier: z.string().max(200) }).parse(await req.json());
  const r = await requestRecovery(b.identifier, ip, process.env.APP_URL || new URL(req.url).origin);
  return { ok: true, mailConfigured: r.mailConfigured };
});
