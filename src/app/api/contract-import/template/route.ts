import { api, fileResponse } from '@/lib/api';
import { contractTemplate } from '@/lib/services/contractImport';
export const GET = api({ perm: 'contratos.importar' }, async () => fileResponse(await contractTemplate(), 'Plantilla_Carga_Contratos_y_Pagos.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
