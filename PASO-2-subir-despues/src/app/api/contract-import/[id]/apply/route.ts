import { api } from '@/lib/api';
import { applyContractImport } from '@/lib/services/contractImport';
export const POST = api({ perm: 'contratos.importar' }, async ({ user, params, ip }) => applyContractImport(Number(params.id), user, ip));
