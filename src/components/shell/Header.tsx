import Link from "next/link";
import { Nav, ServerLink } from "./Nav";
import { cx } from "@/components/ui/primitives";
import { Activity, Signal, Unplug } from "@/components/ui/icons";

/**
 * De onde vêm os dados desta tela:
 *  - live:    a API do Traefik respondeu nesta leitura;
 *  - demo:    dados fictícios (TRAEFIK_MOCK=1 ou sem TRAEFIK_API_URL);
 *  - offline: há um Traefik configurado, mas a API não respondeu.
 * Antes eram só dois estados (mock ou não), e um Traefik fora do ar
 * aparecia como "live — Conectado em …".
 */
export type Connection = "live" | "demo" | "offline";

const BADGE: Record<Connection, { label: string; tone: string; Icon: typeof Signal }> = {
  live: { label: "live", tone: "border-ok/40 text-ok", Icon: Signal },
  demo: { label: "demo", tone: "border-warn/40 text-warn", Icon: Activity },
  offline: { label: "offline", tone: "border-red/50 text-red", Icon: Unplug },
};

/** Barra fixa de 64px em vidro, no espírito da translucidez do macOS. */
export function Header({
  connection,
  target,
  error,
  authed,
}: {
  connection: Connection;
  target: string;
  /** Motivo da falha, quando offline. */
  error?: string | null;
  authed: boolean;
}) {
  const badge = BADGE[connection];
  const tip =
    connection === "live"
      ? `Conectado em ${target}`
      : connection === "demo"
        ? "Dados de demonstração"
        : /* a mensagem de erro já traz a URL tentada */
          (error ?? `Sem resposta de ${target || "TRAEFIK_API_URL"}`);
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
            "items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em]",
            /* offline aparece em qualquer largura: é o único que pede ação. */
            connection === "offline" ? "inline-flex" : "hidden md:inline-flex",
            badge.tone,
          )}
          title={tip}
          aria-label={`Conexão com o Traefik: ${badge.label}. ${tip}`}
        >
          <badge.Icon size={11} strokeWidth={2.6} aria-hidden />
          {badge.label}
        </span>
        <ServerLink />
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
