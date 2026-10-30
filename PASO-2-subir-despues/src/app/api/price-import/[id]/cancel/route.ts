import { api } from '@/lib/api';
import { cancelPriceImport } from '@/lib/services/priceImport';
export const POST = api({ perm: 'precios.importar' }, async ({ user, params }) => { await cancelPriceImport(Number(params.id), user); return { ok: true }; });
