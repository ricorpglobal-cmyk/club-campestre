import { requirePage } from '@/lib/session';
import { Sidebar } from '@/components/Sidebar';
import { ROLE_LABEL } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requirePage();
  const has = (p: string) => u.perms.has(p as any);
  const groups = [
    { group: 'General', items: [
      has('dashboard.ver') && { href: '/', label: 'Dashboard', icon: '◧' },
    ] },
    { group: 'Comercial', items: [
      has('terrenos.ver') && { href: '/terrenos', label: 'Terrenos', icon: '▦' },
      has('clientes.ver') && { href: '/clientes', label: 'Clientes', icon: '☺' },
      has('contratos.ver') && { href: '/contratos', label: 'Contratos', icon: '▤' },
    ] },
    { group: 'Cobranza', items: [
      has('aportaciones.ver') && { href: '/aportaciones', label: 'Aportaciones', icon: '$' },
      has('calendario.ver') && { href: '/calendario', label: 'Calendario de cobros', icon: '◷' },
      has('estados.ver') && { href: '/estados-cuenta', label: 'Estados de cuenta', icon: '≡' },
    ] },
    { group: 'Análisis', items: [
      (has('reportes.ventas') || has('reportes.cobranza')) && { href: '/reportes', label: 'Reportes y exportaciones', icon: '⇩' },
    ] },
    { group: 'Administración', items: [
      has('precios.importar') && { href: '/terrenos/importar', label: 'Importar lista de precios', icon: '↥' },
      has('contratos.importar') && { href: '/contratos/importar', label: 'Importar contratos', icon: '↥' },
      has('usuarios.administrar') && { href: '/usuarios', label: 'Usuarios', icon: '⚇' },
      has('auditoria.ver') && { href: '/auditoria', label: 'Auditoría', icon: '⌕' },
      has('config.editar') && { href: '/configuracion', label: 'Configuración', icon: '⚙' },
    ] },
  ].map((g) => ({ ...g, items: g.items.filter(Boolean) as any[] })).filter((g) => g.items.length);
  return (
    <div className="min-h-screen">
      <Sidebar items={groups} user={{ name: u.full_name, role: ROLE_LABEL[u.role] }} />
      <main className="lg:pl-64"><div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div></main>
    </div>
  );
}
