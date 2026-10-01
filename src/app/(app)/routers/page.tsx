import { getSnapshot } from "@/lib/snapshot";
import { editableNames, readConfig } from "@/lib/config-store";
import { PageHeader } from "@/components/ui/primitives";
import { SnapshotError } from "@/components/shell/SnapshotError";
import { RoutersView } from "@/components/views/RoutersView";

export const dynamic = "force-dynamic";

export default async function RoutersPage() {
  const [{ snapshot, error, target }, config, owned] = await Promise.all([
    getSnapshot(),
    readConfig(),
    editableNames(),
  ]);
  if (!snapshot) return <SnapshotError eyebrow="Routers" target={target} error={error} />;

  const total = snapshot.routers.http.length + snapshot.routers.tcp.length + snapshot.routers.udp.length;

  /* Listas de apoio para os seletores do formulário: o que o Traefik já
     conhece somado ao que existe no nosso arquivo. */
  const entryPoints = snapshot.entryPoints.map((e) => e.name);
  const knownServices = [
    ...new Set([
      ...snapshot.services.http.map((s) => s.name),
      ...Object.keys(config.http?.services ?? {}),
    ]),
  ].sort();
  const knownMiddlewares = [
    ...new Set([
      ...snapshot.middlewares.http.map((m) => m.name),
      ...Object.keys(config.http?.middlewares ?? {}),
    ]),
  ].sort();

  return (
    <>
      <PageHeader
        eyebrow="Roteamento"
        title="Routers"
        subtitle="Cada router casa requisições por regra e as entrega a um service. Clique numa linha para abrir os detalhes."
        action={
          <div className="text-right">
            <span className="label-caps block">Total</span>
            <span className="title-black text-[36px] tabular-nums">{total}</span>
          </div>
        }
      />
      <RoutersView
        routers={snapshot.routers}
        owned={{ http: owned.http.routers, tcp: owned.tcp.routers, udp: owned.udp.routers }}
        entryPoints={entryPoints}
        knownServices={knownServices}
        knownMiddlewares={knownMiddlewares}
      />
    </>
  );
}
