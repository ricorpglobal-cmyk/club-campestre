import { api } from '@/lib/api';
import { applyPriceImport } from '@/lib/services/priceImport';
export const POST = api({ perm: 'precios.importar' }, async ({ req, user, params, ip }) => {
  const b = await req.json().catch(() => ({}));
  return applyPriceImport(Number(params.id), { markHighlighted: b.markHighlighted !== false }, user, ip);
});
