import { PageHeader } from "@/components/ui/primitives";
import { getDashboard } from "@/lib/metrics";
import { MetricsView } from "@/components/views/MetricsView";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  /* Render inicial no servidor; a partir daí o cliente faz o polling. */
  const initial = getDashboard();

  return (
    <>
      <PageHeader
        eyebrow="Observabilidade"
        title="Métricas"
        subtitle="Volume, latência e tráfego lidos do endpoint Prometheus do Traefik. A API REST descreve a configuração; só as métricas contam o que de fato passou."
      />
      <MetricsView initial={initial} />
    </>
  );
}
