import type { Metadata } from "next";
import { Barlow_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Traefik Control",
  description: "Painel de gerenciamento para Traefik — routers, services, middlewares e entrypoints.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={barlow.variable}>
      <body className="min-h-dvh bg-ink text-fg">{children}</body>
    </html>
  );
}
