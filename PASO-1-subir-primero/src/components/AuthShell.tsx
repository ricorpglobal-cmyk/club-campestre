export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-wide text-white">CLUB CAMPESTRE</div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-brand-200">Sistema de control de ventas y cobranza</div>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );
}
