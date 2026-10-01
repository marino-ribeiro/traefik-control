import { Mono, Notice, PageHeader } from "@/components/ui/primitives";

/** Shared unreachable-Traefik state for every data-backed page. */
export function SnapshotError({ eyebrow, target, error }: { eyebrow: string; target: string; error: string | null }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title="Sem dados" subtitle="A API do Traefik não respondeu a esta leitura." />
      <Notice tone="error">
        <strong className="font-bold">Falha ao conectar em {target || "(TRAEFIK_API_URL não definida)"}</strong>
        <br />
        {error}
        <br />
        <span className="mt-2 block text-muted">
          Para explorar a interface sem um Traefik, suba com <Mono>TRAEFIK_MOCK=1</Mono>.
        </span>
      </Notice>
    </>
  );
}
