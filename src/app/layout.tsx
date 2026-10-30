import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Club Campestre | Sistema de Control de Ventas y Cobranza',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
