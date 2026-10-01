import { getSnapshot } from "@/lib/snapshot";
import { editableNames, lockedNames, readConfig } from "@/lib/config-store";
import { PageHeader } from "@/components/ui/primitives";
import { SnapshotError } from "@/components/shell/SnapshotError";
import { ServicesView } from "@/components/views/ServicesView";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [{ snapshot, error, target }, owned, config] = await Promise.all([
    getSnapshot(),
    editableNames(),
    readConfig(),
  ]);
  const locked = lockedNames();
  if (!snapshot) return <SnapshotError eyebrow="Services" target={target} error={error} />;

  const total = snapshot.services.http.length + snapshot.services.tcp.length + snapshot.services.udp.length;

  return (
    <>
      <PageHeader
        eyebrow="Backends"
        title="Services"
        subtitle="Para onde o tráfego vai depois de casar um router — com balanceamento, health check e sessão fixa."
        action={
          <div className="text-right">
            <span className="label-caps block">Total</span>
            <span className="title-black text-[36px] tabular-nums">{total}</span>
          </div>
        }
      />
      <ServicesView
        services={snapshot.services}
        owned={{ http: owned.http.services, tcp: owned.tcp.services, udp: owned.udp.services }}
        locked={{ http: locked.http.services, tcp: locked.tcp.services, udp: locked.udp.services }}
        transports={Object.keys(config.http?.serversTransports ?? {}).sort()}
      />
    </>
  );
}
