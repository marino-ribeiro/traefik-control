import Link from "next/link";
import { Nav } from "./Nav";
import { cx } from "@/components/ui/primitives";
import { Activity, Signal } from "@/components/ui/icons";

/** Barra fixa de 64px em vidro, no espírito da translucidez do macOS. */
export function Header({
  mock,
  target,
  version,
  authed,
}: {
  mock: boolean;
  target: string;
  version?: string;
  authed: boolean;
}) {
  return (
    <header className="glass-bar fixed inset-x-0 top-0 z-[100] flex h-header items-center justify-between gap-6 px-5 md:px-7">
      <Link href="/" className="flex shrink-0 items-baseline gap-1.5 tracking-[0.02em]">
        <span className="text-[22px] font-black -tracking-[0.5px] text-fg">TRAEFIK</span>
        <span aria-hidden className="relative top-[2px] inline-block h-4 w-[2px] bg-red" />
        <span className="hidden text-[14px] font-normal uppercase tracking-[0.22em] text-muted sm:inline">
          Control
        </span>
      </Link>

      <Nav />

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={cx(
            "hidden items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] md:inline-flex",
            mock ? "border-warn/40 text-warn" : "border-ok/40 text-ok",
          )}
          title={mock ? "Dados de demonstração" : `Conectado em ${target}`}
        >
          {mock ? <Activity size={11} strokeWidth={2.6} aria-hidden /> : <Signal size={11} strokeWidth={2.6} aria-hidden />}
          {mock ? "demo" : "live"}
        </span>
        {version && <span className="hidden font-mono text-[11px] text-muted/70 xl:inline">v{version}</span>}
        {authed && (
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-control px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted transition-colors duration-200 ease-geist hover:bg-white/5 hover:text-red"
            >
              Sair
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
