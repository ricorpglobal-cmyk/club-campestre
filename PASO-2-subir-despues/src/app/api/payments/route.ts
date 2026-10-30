import { api } from '@/lib/api';
import { registerPayment } from '@/lib/services/payments';
export const POST = api({ perm: 'aportaciones.registrar' }, async ({ req, user, ip }) => registerPayment(await req.json(), user, ip));
