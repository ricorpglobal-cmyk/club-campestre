'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LogoutButton } from './client';

type Item = { href: string; label: string; icon: string };
export function Sidebar({ items, user }: { items: { group: string; items: Item[] }[]; user: { name: string; role: string } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const all = items.flatMap((g) => g.items.map((i) => i.href));
  const match = (h: string) => (h === '/' ? path === '/' : path === h || path.startsWith(h + '/'));
  const best = all.filter(match).sort((a, b) => b.length - a.length)[0];
  const active = (h: string) => h === best;
  const nav = (
    <nav className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-5">
        <div className="text-[15px] font-bold tracking-wide text-white">CLUB CAMPESTRE</div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-brand-200">Control de ventas y cobranza</div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {items.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-300/80">{g.group}</div>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline ${active(i.href) ? 'bg-white/15 font-medium text-white' : 'text-brand-100 hover:bg-white/10'}`}>
                <span className="w-4 text-center opacity-80" aria-hidden>{i.icon}</span>{i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-3 py-3">
        <Link href="/perfil" className="block rounded-lg px-3 py-2 no-underline hover:bg-white/10">
          <div className="truncate text-sm font-medium text-white">{user.name}</div>
          <div className="text-[11px] text-brand-200">{user.role}</div>
        </Link>
        <LogoutButton />
      </div>
    </nav>
  );
  return (
    <>
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-brand-900 px-4 py-3 lg:hidden">
        <span className="text-sm font-bold text-white">CLUB CAMPESTRE</span>
        <button className="text-white" onClick={() => setOpen(!open)} aria-label="Menú">☰</button>
      </div>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`no-print fixed inset-y-0 left-0 z-50 w-64 bg-brand-900 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>{nav}</aside>
    </>
  );
}
