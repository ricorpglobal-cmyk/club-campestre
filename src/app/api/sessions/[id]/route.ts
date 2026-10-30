import { api } from '@/lib/api';
import { revokeSession } from '@/lib/services/users';
export const DELETE = api({}, async ({ user, params, ip }) => { await revokeSession(params.id, user, ip); return { ok: true }; });
