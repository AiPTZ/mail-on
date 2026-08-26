import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mail ON — Disparo que nao queima o dominio",
  description:
    "Plataforma white-label para agencias enviarem email marketing no dominio autenticado do cliente.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230A0A0B'/%3E%3Cpath d='M16 6l2.1 6.4h6.8l-5.5 4 2.1 6.5L16 19l-5.5 3.9 2.1-6.5-5.5-4h6.8z' fill='%23D4AF37'/%3E%3C/svg%3E",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
