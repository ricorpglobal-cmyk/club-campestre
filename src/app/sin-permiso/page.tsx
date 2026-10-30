import Link from 'next/link';
export default function NoPerm() {
  return <div className="flex min-h-screen items-center justify-center p-6"><div className="card max-w-md p-8 text-center">
    <h1>Acceso restringido</h1><p className="mt-2 text-sm muted">Su usuario no tiene permiso para consultar esta sección. Si lo necesita, solicítelo al administrador.</p>
    <Link href="/perfil" className="btn-primary mt-5">Ir a mi perfil</Link></div></div>;
}
