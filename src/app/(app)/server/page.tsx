import { Badge, Mono, PageHeader, Panel } from "@/components/ui/primitives";
import { DetailGrid, DetailItem } from "@/components/views/ProtocolTabs";
import { ServerAddresses } from "@/components/views/ServerAddresses";
import { authDisabled } from "@/lib/auth";
import { DYNAMIC_FILE } from "@/lib/config-store";
import { metricsUrl } from "@/lib/metrics";
import { getSnapshot } from "@/lib/snapshot";
import { providersOf } from "@/lib/traefik";

export const dynamic = "force-dynamic";

/**
 * Infraestrutura: onde o painel e o Traefik rodam e com que configuração.
 * Renderiza mesmo com o Traefik fora do ar — é justamente quando endereço,
 * URL da API e modo de operação mais ajudam a diagnosticar.
 */
export default async function ServerPage() {
  const { snapshot, error, target } = await getSnapshot();
  const metrics = metricsUrl();
  const mock = snapshot?.mock ?? false;

  return (
    <>
      <PageHeader
        eyebrow="Infraestrutura"
        title="Servidor"
        subtitle="Onde o Traefik e este painel estão rodando: endereços para apontamento DNS e a configuração em uso."
      />

      <ServerAddresses />

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel eyebrow="Proxy" title="Traefik">
          <div className="px-6 py-6">
            <DetailGrid>
              <DetailItem label="Versão">
                {snapshot?.version?.Version ? (
                  <span>
                    <Mono>{snapshot.version.Version}</Mono>
                    {snapshot.version.Codename && (
                      <span className="ml-2 text-[13px] text-muted">{snapshot.version.Codename}</span>
                    )}
                  </span>
                ) : (
                  "—"
                )}
              </DetailItem>
              <DetailItem label="No ar desde">
                <Uptime start={snapshot?.version?.startDate} at={snapshot?.fetchedAt} />
              </DetailItem>
              <DetailItem label="API">
                <span className="space-y-1">
                  <Mono className="block break-all">{mock ? "dados de demonstração" : target || "—"}</Mono>
                  {!snapshot && <span className="block text-[13px] text-red">fora de alcance: {error}</span>}
                </span>
              </DetailItem>
              <DetailItem label="Providers ativos">
                {snapshot && providersOf(snapshot).length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {providersOf(snapshot).map((p) => (
                      <Badge key={p}>{p}</Badge>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </DetailItem>
            </DetailGrid>
          </div>
        </Panel>

        <Panel eyebrow="Este painel" title="Configuração">
          <div className="px-6 py-6">
            <DetailGrid>
              <DetailItem label="Modo">
                {mock ? <Badge tone="warn">demonstração</Badge> : <Badge tone="ok">ao vivo</Badge>}
              </DetailItem>
              <DetailItem label="Arquivo que o painel grava">
                <Mono className="break-all">{DYNAMIC_FILE}</Mono>
              </DetailItem>
              <DetailItem label="Métricas (Prometheus)">
                {metrics && !mock ? <Mono className="break-all">{metrics}</Mono> : "desligadas"}
              </DetailItem>
              <DetailItem label="Autenticação">
                {authDisabled() ? (
                  <span className="text-red">desligada — defina UI_PASSWORD</span>
                ) : process.env.UI_SESSION_SECRET ? (
                  "senha + sessão de 12h"
                ) : (
                  <span>
                    senha + sessão de 12h
                    <span className="block text-[13px] text-warn">
                      sem UI_SESSION_SECRET: cada restart desloga todo mundo
                    </span>
                  </span>
                )}
              </DetailItem>
            </DetailGrid>
          </div>
        </Panel>
      </div>
    </>
  );
}

/** Data de início em UTC + há quanto tempo, medido até a leitura do snapshot (`at`). */
function Uptime({ start, at: readAt }: { start?: string; at?: string }) {
  const at = start ? new Date(start) : null;
  const ref = readAt ? new Date(readAt) : null;
  if (!at || !ref || Number.isNaN(at.getTime()) || Number.isNaN(ref.getTime())) return <>—</>;
  const when = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(at);
  return (
    <span>
      {when} <span className="text-muted">UTC</span>
      <span className="block text-[13px] text-muted">há {elapsed(ref.getTime() - at.getTime())}</span>
    </span>
  );
}

function elapsed(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} dias`;
}
