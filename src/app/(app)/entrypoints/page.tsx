import { getSnapshot } from "@/lib/snapshot";
import { Badge, EmptyState, Mono, PageHeader } from "@/components/ui/primitives";
import { SnapshotError } from "@/components/shell/SnapshotError";

export const dynamic = "force-dynamic";

export default async function EntryPointsPage() {
  const { snapshot, error, target } = await getSnapshot();
  if (!snapshot) return <SnapshotError eyebrow="Entrypoints" target={target} error={error} />;

  const { entryPoints, routers } = snapshot;

  /** How many routers across all protocols bind to a given entrypoint. */
  const usage = (name: string) =>
    (["http", "tcp", "udp"] as const).reduce(
      (n, p) => n + routers[p].filter((r) => r.entryPoints?.includes(name)).length,
      0,
    );

  return (
    <>
      <PageHeader
        eyebrow="Portas de entrada"
        title="Entrypoints"
        subtitle="As portas em que o Traefik escuta. Definidos na configuração estática — só mudam com restart."
        action={
          <div className="text-right">
            <span className="label-caps block">Total</span>
            <span className="title-black text-[36px] tabular-nums">{entryPoints.length}</span>
          </div>
        }
      />

      {entryPoints.length === 0 ? (
        <div className="glass rounded-panel">
          <EmptyState title="Nenhum entrypoint" hint="A API não retornou entrypoints para esta instância." />
        </div>
      ) : (
        <section className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
          {entryPoints.map((ep) => {
            const redirect = ep.http?.redirections?.entryPoint;
            const count = usage(ep.name);
            return (
              <article
                key={ep.name}
                className="glass-tile rounded-tile px-7 py-8 transition-[box-shadow,transform] duration-200 ease-geist hover:-translate-y-px hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="title-black text-[24px]">{ep.name}</h2>
                  {ep.asDefault && <Badge tone="red">default</Badge>}
                </div>

                <p className="mt-3 font-mono text-[18px] text-orange">{ep.address}</p>

                <dl className="mt-6 space-y-3 border-t border-white/8 pt-5 text-[13.5px]">
                  <div className="flex justify-between gap-3">
                    <dt className="label-caps">Routers</dt>
                    <dd className="tabular-nums text-fg">{count}</dd>
                  </div>
                  {redirect && (
                    <div className="flex justify-between gap-3">
                      <dt className="label-caps">Redireciona</dt>
                      <dd className="text-fg">
                        → <Mono>{redirect.to}</Mono>
                        {redirect.scheme && <span className="text-muted"> ({redirect.scheme})</span>}
                      </dd>
                    </div>
                  )}
                  {ep.http?.tls?.certResolver && (
                    <div className="flex justify-between gap-3">
                      <dt className="label-caps">Cert resolver</dt>
                      <dd className="text-fg">{ep.http.tls.certResolver}</dd>
                    </div>
                  )}
                  {ep.http?.middlewares?.length ? (
                    <div className="flex flex-wrap justify-between gap-2">
                      <dt className="label-caps">Middlewares</dt>
                      <dd className="flex flex-wrap justify-end gap-1">
                        {ep.http.middlewares.map((m) => (
                          <Badge key={m}>{m}</Badge>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
