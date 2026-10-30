import { api } from '@/lib/api';
import { cancelContractImport } from '@/lib/services/contractImport';
export const POST = api({ perm: 'contratos.importar' }, async ({ user, params }) => { await cancelContractImport(Number(params.id), user); return { ok: true }; });
