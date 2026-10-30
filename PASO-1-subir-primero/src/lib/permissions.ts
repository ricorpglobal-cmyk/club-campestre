export const PERMISSIONS = {
  'dashboard.ver': 'Ver dashboard',
  'dashboard.filtro_usuario': 'Filtrar dashboard por usuario',
  'terrenos.ver': 'Consultar terrenos',
  'terrenos.editar': 'Administrar terrenos y estatus',
  'precios.importar': 'Importar listas de precios',
  'clientes.ver': 'Consultar clientes',
  'clientes.editar': 'Alta y edición de clientes',
  'clientes.fiscal': 'Ver información fiscal y documentos',
  'contratos.ver': 'Consultar contratos',
  'contratos.crear': 'Alta de contratos',
  'contratos.editar': 'Modificar contratos',
  'contratos.cancelar': 'Cancelar contratos',
  'contratos.excepcion': 'Autorizar condiciones especiales',
  'contratos.importar': 'Importar contratos y pagos históricos',
  'aportaciones.ver': 'Consultar aportaciones',
  'aportaciones.registrar': 'Registrar aportaciones',
  'aportaciones.cancelar': 'Cancelar/revertir aportaciones',
  'calendario.ver': 'Consultar calendario de cobros',
  'estados.ver': 'Consultar estados de cuenta',
  'reportes.ventas': 'Reportes de ventas',
  'reportes.cobranza': 'Reportes de cobranza',
  'reportes.exportar': 'Exportar reportes a Excel',
  'usuarios.administrar': 'Administrar usuarios y permisos',
  'auditoria.ver': 'Consultar auditoría',
  'config.editar': 'Configurar el sistema',
} as const;
export type Perm = keyof typeof PERMISSIONS;
export const ALL_PERMS = Object.keys(PERMISSIONS) as Perm[];

export type Role = 'ADMINISTRADOR' | 'VENTAS' | 'COBRANZA' | 'CONSULTA';
export const ROLE_LABEL: Record<Role, string> = {
  ADMINISTRADOR: 'Administrador', VENTAS: 'Ventas', COBRANZA: 'Cobranza', CONSULTA: 'Consulta / Dirección',
};

export const ROLE_PERMS: Record<Role, Perm[]> = {
  ADMINISTRADOR: ALL_PERMS,
  VENTAS: ['dashboard.ver', 'terrenos.ver', 'clientes.ver', 'clientes.editar', 'contratos.ver', 'contratos.crear', 'reportes.ventas', 'reportes.exportar'],
  COBRANZA: ['dashboard.ver', 'terrenos.ver', 'clientes.ver', 'contratos.ver', 'calendario.ver', 'aportaciones.ver', 'aportaciones.registrar', 'estados.ver', 'reportes.cobranza', 'reportes.exportar'],
  CONSULTA: ['dashboard.ver', 'terrenos.ver', 'clientes.ver', 'contratos.ver', 'calendario.ver', 'aportaciones.ver', 'estados.ver', 'reportes.ventas', 'reportes.cobranza', 'reportes.exportar'],
};

/** Permisos que nunca se pueden otorgar fuera del rol Administrador. */
export const ADMIN_ONLY: Perm[] = ['usuarios.administrar', 'config.editar'];

export function effectivePerms(role: Role, extra: string[] = [], revoked: string[] = []): Set<Perm> {
  const s = new Set<Perm>(ROLE_PERMS[role]);
  for (const p of extra) if ((ALL_PERMS as string[]).includes(p) && (role === 'ADMINISTRADOR' || !ADMIN_ONLY.includes(p as Perm))) s.add(p as Perm);
  for (const p of revoked) s.delete(p as Perm);
  return s;
}
