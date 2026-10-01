import { PageHeader, Mono, Notice } from "@/components/ui/primitives";
import { DYNAMIC_FILE, lockedNames, readConfig, readConfigRaw } from "@/lib/config-store";
import { getSnapshot } from "@/lib/snapshot";
import { ManageView } from "@/components/views/ManageView";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const [config, raw, { snapshot }] = await Promise.all([readConfig(), readConfigRaw(), getSnapshot()]);

  const entryPoints = (snapshot?.entryPoints ?? []).map((e) => e.name);
  const knownServices = [
    ...new Set([
      ...(snapshot?.services.http ?? []).map((s) => s.name),
      ...Object.keys(config.http?.services ?? {}),
    ]),
  ].sort();
  const knownMiddlewares = [
    ...new Set([
      ...(snapshot?.middlewares.http ?? []).map((m) => m.name),
      ...Object.keys(config.http?.middlewares ?? {}),
    ]),
  ].sort();

  return (
    <>
      <PageHeader
        eyebrow="Escrita"
        title="Gerenciar"
        subtitle="Cria, edita e remove objetos no arquivo do file provider. O Traefik recarrega sozinho quando o arquivo muda."
      />

      <div className="mb-8">
        <Notice tone="info">
          Gravando em <Mono>{DYNAMIC_FILE}</Mono>. Só o que estiver neste arquivo é editável — objetos vindos do
          provider Docker aparecem nas outras abas, mas são somente leitura. Cada gravação guarda um backup da
          versão anterior.
        </Notice>
      </div>

      <ManageView
        config={config}
        raw={raw}
        entryPoints={entryPoints}
        knownServices={knownServices}
        knownMiddlewares={knownMiddlewares}
        locked={lockedNames()}
      />
    </>
  );
}
