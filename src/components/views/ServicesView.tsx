"use client";

import { useRouter as useNextRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, Button, IconButton, Mono, Notice, StatusMark } from "@/components/ui/primitives";
import { ArrowDownCircle, ArrowUpCircle, Server, providerIcon } from "@/components/ui/icons";
import { DetailGrid, DetailItem, ProtocolTabs } from "./ProtocolTabs";
import { ReadOnlyMark, ResourceEditor, deleteResource, isEditable, type EditorTarget } from "./ResourceEditor";
import type { Protocol, TraefikService } from "@/lib/types";

const PROTOCOLS: { key: Protocol; label: string }[] = [
  { key: "http", label: "HTTP" },
  { key: "tcp", label: "TCP" },
  { key: "udp", label: "UDP" },
];

function serversOf(s: TraefikService): string[] {
  return (s.loadBalancer?.servers ?? []).map((srv) => srv.url ?? srv.address ?? "").filter(Boolean);
}

export function ServicesView({
  services,
  owned,
  locked,
}: {
  services: Record<Protocol, TraefikService[]>;
  owned: Record<Protocol, string[]>;
  locked: Record<Protocol, string[]>;
}) {
  const nav = useNextRouter();
  const [proto, setProto] = useState<Protocol>("http");
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [flash, setFlash] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const rows = services[proto];

  async function remove(name: string) {
    if (!confirm(`Remover o service "${name}"? Um backup do arquivo será mantido.`)) return;
    const res = await deleteResource(proto, "services", name);
    setFlash(
      res.ok
        ? { tone: "info", text: `"${name}" removido. O Traefik recarrega em instantes.` }
        : { tone: "error", text: res.error ?? "falha ao remover" },
    );
    if (res.ok) nav.refresh();
  }

  const columns: Column<TraefikService>[] = [
    {
      key: "status",
      header: "",
      headClassName: "w-8",
      className: "w-8 pr-0",
      render: (s) => <StatusMark status={s.status} />,
      sortValue: (s) => s.status ?? "",
    },
    {
      key: "name",
      header: "Nome",
      sortValue: (s) => s.name,
      render: (s) => <span className="font-mono text-[13.5px] font-medium text-fg">{s.name}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      render: (s) => <Badge>{s.type ?? "—"}</Badge>,
      sortValue: (s) => s.type ?? "",
    },
    {
      key: "servers",
      header: "Servidores",
      render: (s) => {
        const list = serversOf(s);
        if (list.length === 0) return <span className="text-muted/50">—</span>;
        return (
          <span className="space-y-0.5">
            {list.slice(0, 2).map((u) => (
              <span key={u} className="flex items-center gap-2">
                <HealthDot state={s.serverStatus?.[u]} />
                <Mono>{u}</Mono>
              </span>
            ))}
            {list.length > 2 && <span className="block text-[12px] text-muted">+{list.length - 2} outros</span>}
          </span>
        );
      },
      sortValue: (s) => serversOf(s).length,
    },
    {
      key: "usedBy",
      header: "Usado por",
      render: (s) => <span className="text-[13px] tabular-nums text-muted">{s.usedBy?.length ?? 0} router(s)</span>,
      sortValue: (s) => s.usedBy?.length ?? 0,
    },
    {
      key: "provider",
      header: "Provider",
      render: (s) => {
        const Icon = providerIcon(s.provider);
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Icon size={13} strokeWidth={2} aria-hidden />
            {s.provider ?? "—"}
          </span>
        );
      },
      sortValue: (s) => s.provider ?? "",
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-20",
      className: "w-20",
      render: (s) =>
        isEditable(s.name, owned[proto]) ? (
          <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <IconButton Icon={Pencil} label={`Editar ${s.name}`} onClick={() => setTarget({ name: s.name })} />
            <IconButton
              Icon={Trash2}
              label={`Remover ${s.name}`}
              className="hover:text-red"
              onClick={() => void remove(s.name)}
            />
          </span>
        ) : (
          <ReadOnlyMark provider={s.provider} locked={isEditable(s.name, locked[proto])} />
        ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ProtocolTabs
          value={proto}
          onChange={(v) => setProto(v as Protocol)}
          options={PROTOCOLS}
          counts={{ http: services.http.length, tcp: services.tcp.length, udp: services.udp.length }}
        />
        <Button className="px-5 py-2.5" onClick={() => setTarget({})}>
          <Plus size={14} strokeWidth={2.6} aria-hidden />
          Novo service
        </Button>
      </div>

      {flash && (
        <div className="mb-3">
          <Notice tone={flash.tone === "error" ? "error" : "info"}>{flash.text}</Notice>
        </div>
      )}

      <div className="glass rounded-panel overflow-hidden">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(s) => s.name}
          searchable={(s) => [s.name, s.type, s.provider, ...serversOf(s)]}
          filters={[
            { key: "provider", label: "Provider", value: (s) => s.provider },
            { key: "type", label: "Tipo", value: (s) => s.type },
          ]}
          emptyTitle={`Nenhum service ${proto.toUpperCase()}`}
          emptyIcon={Server}
          detail={(s) => (
            <DetailGrid>
              <DetailItem label="Todos os servidores">
                {serversOf(s).length ? (
                  <ul className="space-y-1">
                    {serversOf(s).map((u) => (
                      <li key={u} className="flex items-center gap-2">
                        <HealthDot state={s.serverStatus?.[u]} />
                        <Mono>{u}</Mono>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "nenhum servidor no load balancer"
                )}
              </DetailItem>
              <DetailItem label="Routers que apontam aqui">
                {s.usedBy?.length ? (
                  <span className="flex flex-wrap gap-1">
                    {s.usedBy.map((r) => (
                      <Badge key={r}>{r}</Badge>
                    ))}
                  </span>
                ) : (
                  "nenhum — este service está órfão"
                )}
              </DetailItem>
              <DetailItem label="Health check">
                {s.loadBalancer?.healthCheck ? (
                  <span className="space-y-0.5">
                    <span className="block">path: {s.loadBalancer.healthCheck.path ?? "—"}</span>
                    <span className="block">interval: {s.loadBalancer.healthCheck.interval ?? "—"}</span>
                    <span className="block">timeout: {s.loadBalancer.healthCheck.timeout ?? "—"}</span>
                  </span>
                ) : (
                  "não configurado"
                )}
              </DetailItem>
              <DetailItem label="Sessão fixa (sticky)">
                {s.loadBalancer?.sticky?.cookie
                  ? `cookie ${s.loadBalancer.sticky.cookie.name ?? "(padrão)"}`
                  : "desativada"}
              </DetailItem>
              <DetailItem label="passHostHeader">
                {s.loadBalancer?.passHostHeader == null ? "padrão" : String(s.loadBalancer.passHostHeader)}
              </DetailItem>
              {s.error?.length ? (
                <DetailItem label="Erros">
                  <ul className="space-y-1 text-red">
                    {s.error.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </DetailItem>
              ) : null}
            </DetailGrid>
          )}
        />
      </div>

      <ResourceEditor kind="services" section={proto} target={target} onClose={() => setTarget(null)} />
    </>
  );
}

/** Seta para cima/baixo em vez de bolinha: a forma diz o estado sem a cor. */
function HealthDot({ state }: { state?: string }) {
  if (state == null) {
    return (
      <span className="inline-block size-[13px] shrink-0" title="estado desconhecido" aria-label="estado desconhecido" />
    );
  }
  const up = state === "UP";
  const Icon = up ? ArrowUpCircle : ArrowDownCircle;
  /* O título vai no wrapper: os ícones do lucide não repassam `title`. */
  return (
    <span className="inline-flex shrink-0" title={state} aria-label={state} role="img">
      <Icon size={13} strokeWidth={2.3} className={up ? "text-ok" : "text-down"} aria-hidden />
    </span>
  );
}
