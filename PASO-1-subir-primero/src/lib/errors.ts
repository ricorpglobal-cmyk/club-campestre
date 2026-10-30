export class AppError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new AppError(400, m, d);
export const forbidden = (m = 'No tiene permiso para realizar esta operación.') => new AppError(403, m);
export const notFound = (m = 'Registro no encontrado.') => new AppError(404, m);
export const conflict = (m: string, d?: unknown) => new AppError(409, m, d);

/** Traduce errores de PostgreSQL a mensajes comprensibles. */
export function mapDbError(e: any): AppError | null {
  if (!e || typeof e !== 'object' || !('code' in e)) return null;
  switch (e.code) {
    case 'P0010': return conflict('No se permiten más de 10 cuentas de usuario activas.');
    case 'P0011': return conflict(String(e.message).replace(/^OPERACION_PROHIBIDA: /, ''));
    case '23505': {
      const c = String(e.constraint || '');
      if (c.includes('contracts_one_active_per_lot')) return conflict('El terreno ya tiene un contrato vigente.');
      if (c.includes('users_username')) return conflict('El nombre de usuario ya existe.');
      if (c.includes('users_email')) return conflict('El correo ya está registrado en otro usuario.');
      if (c.includes('contract_number')) return conflict('El número de contrato ya existe.');
      if (c.includes('idempotency')) return conflict('La operación ya fue registrada.');
      return conflict('El registro ya existe (duplicado).');
    }
    case '23503': return badRequest('El registro relacionado no existe.');
    case '23514': return badRequest('Los datos no cumplen las reglas de validación.');
    case '22P02': return badRequest('Formato de dato inválido.');
    default: return null;
  }
}
