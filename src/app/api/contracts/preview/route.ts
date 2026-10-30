import { api } from '@/lib/api';
import { previewContract } from '@/lib/services/contracts';
export const POST = api({ perm: 'contratos.crear' }, async ({ req }) => previewContract(await req.json()));
