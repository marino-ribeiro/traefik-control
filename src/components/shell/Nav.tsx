"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";
import { DoorOpen, Gauge, HardDrive, Layers, LayoutDashboard, Route, Server, Sliders, type LucideIcon } from "@/components/ui/icons";

interface NavLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const LINKS: NavLink[] = [
  { href: "/", label: "Visão geral", Icon: LayoutDashboard },
  { href: "/dashboard", label: "Métricas", Icon: Gauge },
  { href: "/routers", label: "Routers", Icon: Route },
  { href: "/services", label: "Services", Icon: Server },
  { href: "/middlewares", label: "Middlewares", Icon: Layers },
  { href: "/entrypoints", label: "Entrypoints", Icon: DoorOpen },
  { href: "/manage", label: "Gerenciar", Icon: Sliders },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
      {LINKS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={label}
            className={cx(
              "flex items-center gap-2 rounded-control px-3 py-2 text-[12.5px] font-medium uppercase tracking-[0.09em]",
              "transition-[background,color] duration-200 ease-geist",
              active ? "bg-white/8 text-fg" : "text-muted hover:bg-white/5 hover:text-fg",
            )}
          >
            <Icon size={14} strokeWidth={2.2} aria-hidden className={active ? "text-red" : ""} />
            {/* Com os 7 itens, logo, selos e o atalho do Servidor, os rótulos só cabem a partir de ~1320px;
                abaixo disso fica só o ícone. sr-only (não hidden): o leitor de
                tela continua lendo o nome do link. */}
            <span className="sr-only min-[1320px]:not-sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Rolagem horizontal abaixo do header nas telas estreitas. */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="scroll-slim glass-bar flex gap-1 overflow-x-auto px-2 py-2 lg:hidden" aria-label="Principal (mobile)">
      {LINKS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-control px-3 py-2 text-[11.5px] font-bold uppercase tracking-[0.1em]",
              "transition-colors duration-200 ease-geist",
              active ? "btn-grad text-fg" : "text-muted hover:text-fg",
            )}
          >
            <Icon size={13} strokeWidth={2.4} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Atalho para a página Servidor, ao lado do selo live/demo no header — fora
 * do menu principal, que é sobre roteamento. Visível em qualquer largura:
 * é o único caminho até a página, inclusive no mobile.
 */
export function ServerLink() {
  const active = isActive(usePathname(), "/server");
  return (
    <Link
      href="/server"
      aria-current={active ? "page" : undefined}
      aria-label="Servidor: endereços e configuração"
      title="Servidor: endereços e configuração"
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-control border transition-colors duration-200 ease-geist",
        active
          ? "border-red/50 bg-white/8 text-red"
          : "border-white/10 text-muted hover:border-white/25 hover:bg-white/5 hover:text-fg",
      )}
    >
      <HardDrive size={14} strokeWidth={2.2} aria-hidden />
    </Link>
  );
}
