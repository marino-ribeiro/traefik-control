import Link from "next/link";
import { getSnapshot } from "@/lib/snapshot";
import { providersOf } from "@/lib/traefik";
import { StatTile } from "@/components/ui/StatTile";
import { Badge, EmptyState, Mono, Notice, Panel, PageHeader, StatusMark } from "@/components/ui/primitives";
import type { TraefikRouter, TraefikSnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { snapshot, error, target } = await getSnapshot();

  if (!snapshot) {
    return (
      <>
        <PageHeader
          eyebrow="Visão geral"
          title="Traefik fora de alcance"
          subtitle="O painel está de pé, mas não conseguiu falar com a API do Traefik."
        />
        <Notice tone="error">
          <strong className="font-bold">Falha ao conectar em {target || "(TRAEFIK_API_URL não definida)"}</strong>
          <br />
          {error}
        </Notice>
        <div className="glass mt-6 rounded-panel p-6 text-[14px] leading-relaxed text-muted">
          <p className="mb-3">Checklist rápido:</p>
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              O Traefik precisa subir com <Mono>--api.insecure=true</Mono> ou um router expondo{" "}
              <Mono>api@internal</Mono>.
            </li>
            <li>
              <Mono>TRAEFIK_API_URL</Mono> deve apontar para a base — por exemplo{" "}
              <Mono>http://traefik:8080</Mono>, sem o <Mono>/api</Mono>.
            </li>
            <li>
              Sem nenhum Traefik à mão, rode com <Mono>TRAEFIK_MOCK=1</Mono> para explorar a interface.
            </li>
          </ul>
        </div>
      </>
    );
  }

  const { overview } = snapshot;
  const http = overview.http ?? {};
  const providers = providersOf(snapshot);
  const unhealthy = collectUnhealthy(snapshot);

  const totalErrors =
    (http.routers?.errors ?? 0) + (http.services?.errors ?? 0) + (http.middlewares?.errors ?? 0);
  const totalWarnings =
    (http.routers?.warnings ?? 0) + (http.services?.warnings ?? 0) + (http.middlewares?.warnings ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Estado do roteamento"
        subtitle={
          snapshot.mock
            ? "Você está vendo dados de demonstração. Defina TRAEFIK_API_URL para conectar num Traefik real."
            : `Leitura ao vivo de ${target}.`
        }
        action={
          <div className="text-right">
            <span className="label-caps block">Traefik</span>
            <span className="title-black text-[28px]">{snapshot.version?.Version ?? "—"}</span>
            {snapshot.version?.Codename && (
              <span className="mt-1 block font-mono text-[12px] text-muted">
                {snapshot.version.Codename}
              </span>
            )}
          </div>
        }
      />

      {snapshot.mock && (
        <div className="mb-8">
          <Notice tone="warn">
            <strong className="font-bold">Modo demonstração.</strong> Os números abaixo são fictícios — servem
            para você avaliar a interface antes de plugar no ambiente real.
          </Notice>
        </div>
      )}

      <section className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <StatTile
          label="HTTP routers"
          value={http.routers?.total ?? snapshot.routers.http.length}
          href="/routers"
          detail={describeSection(http.routers?.warnings, http.routers?.errors)}
        />
        <StatTile
          label="HTTP services"
          value={http.services?.total ?? snapshot.services.http.length}
          href="/services"
          detail={describeSection(http.services?.warnings, http.services?.errors)}
        />
        <StatTile
          label="Middlewares"
          value={http.middlewares?.total ?? snapshot.middlewares.http.length}
          href="/middlewares"
          detail={describeSection(http.middlewares?.warnings, http.middlewares?.errors)}
        />
        <StatTile label="Entrypoints" value={snapshot.entryPoints.length} href="/entrypoints" />
      </section>

      <section className="mb-12 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <StatTile
          label="Erros"
          value={totalErrors}
          tone={totalErrors > 0 ? "red" : "ok"}
          detail={totalErrors > 0 ? "exigem atenção agora" : "nenhum erro reportado"}
        />
        <StatTile
          label="Avisos"
          value={totalWarnings}
          tone={totalWarnings > 0 ? "warn" : "ok"}
          detail={totalWarnings > 0 ? "configuração suspeita" : "nada suspeito"}
        />
        <StatTile
          label="TCP routers"
          value={overview.tcp?.routers?.total ?? snapshot.routers.tcp.length}
          detail="camada 4"
        />
        <StatTile
          label="UDP routers"
          value={overview.udp?.routers?.total ?? snapshot.routers.udp.length}
          detail="camada 4"
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Panel eyebrow="Diagnóstico" title="Precisa de atenção">
          {unhealthy.length === 0 ? (
            <EmptyState
              title="Tudo verde"
              hint="Nenhum router ou service reportou erro ou aviso nesta leitura."
            />
          ) : (
            <ul>
              {unhealthy.map((item) => (
                <li key={`${item.kind}:${item.name}`} className="border-b border-white/6 px-6 py-5 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusMark status={item.status} withLabel />
                    <span className="font-mono text-[13.5px] text-fg">{item.name}</span>
                    <Badge>{item.kind}</Badge>
                  </div>
                  {item.messages.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-[18px]">
                      {item.messages.map((m, i) => (
                        <li key={i} className="text-[13px] leading-relaxed text-muted">
                          {m}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid content-start gap-3">
          <Panel eyebrow="Origem" title="Providers">
            {providers.length === 0 ? (
              <EmptyState title="Sem providers" />
            ) : (
              <ul className="divide-y divide-white/6">
                {providers.map((p) => (
                  <li key={p} className="flex items-center justify-between px-6 py-4">
                    <span className="font-mono text-[13.5px]">{p}</span>
                    <span className="text-[13px] tabular-nums text-muted">
                      {countByProvider(snapshot, p)} objetos
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel eyebrow="Portas" title="Entrypoints">
            <ul className="divide-y divide-white/6">
              {snapshot.entryPoints.slice(0, 6).map((ep) => (
                <li key={ep.name} className="flex items-center justify-between gap-3 px-6 py-4">
                  <span className="truncate font-mono text-[13.5px]">{ep.name}</span>
                  <span className="font-mono text-[13px] text-muted">{ep.address}</span>
                </li>
              ))}
            </ul>
            {snapshot.entryPoints.length > 6 && (
              <Link
                href="/entrypoints"
                className="block border-t border-white/8 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted transition-colors hover:text-red"
              >
                ver os {snapshot.entryPoints.length} →
              </Link>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function describeSection(warnings?: number, errors?: number): string | undefined {
  const parts: string[] = [];
  if (errors) parts.push(`${errors} com erro`);
  if (warnings) parts.push(`${warnings} com aviso`);
  return parts.length ? parts.join(" · ") : "todos saudáveis";
}

interface UnhealthyItem {
  kind: string;
  name: string;
  status?: TraefikRouter["status"];
  messages: string[];
}

/** Flatten every non-enabled router/service across protocols into one list. */
function collectUnhealthy(snapshot: TraefikSnapshot): UnhealthyItem[] {
  const out: UnhealthyItem[] = [];
  const bad = (s?: string) => s === "warning" || s === "error";

  for (const proto of ["http", "tcp", "udp"] as const) {
    for (const r of snapshot.routers[proto]) {
      if (bad(r.status)) {
        out.push({ kind: `${proto} router`, name: r.name, status: r.status, messages: r.error ?? [] });
      }
    }
    for (const s of snapshot.services[proto]) {
      if (bad(s.status)) {
        out.push({ kind: `${proto} service`, name: s.name, status: s.status, messages: s.error ?? [] });
      }
    }
  }
  // Errors before warnings so the worst news is at the top.
  return out.sort((a, b) => (a.status === "error" ? -1 : 1) - (b.status === "error" ? -1 : 1));
}

function countByProvider(snapshot: TraefikSnapshot, provider: string): number {
  let n = 0;
  for (const proto of ["http", "tcp", "udp"] as const) {
    n += snapshot.routers[proto].filter((r) => r.provider === provider).length;
    n += snapshot.services[proto].filter((s) => s.provider === provider).length;
  }
  n += snapshot.middlewares.http.filter((m) => m.provider === provider).length;
  return n;
}
