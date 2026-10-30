import { api } from '@/lib/api';
import { previewPayment } from '@/lib/services/payments';
export const POST = api({ perm: 'aportaciones.registrar' }, async ({ req }) => previewPayment(await req.json()));
