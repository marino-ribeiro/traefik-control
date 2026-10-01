"use client";

import { useRouter as useNextRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, Button, IconButton, Mono, Notice, StatusMark } from "@/components/ui/primitives";
import { Lock, Route, providerIcon } from "@/components/ui/icons";
import { Pencil, Trash2, Plus } from "lucide-react";
import { DetailGrid, DetailItem, ProtocolTabs } from "./ProtocolTabs";
import { ResourceEditor, deleteResource, isEditable, type EditorTarget } from "./ResourceEditor";
import type { Protocol, TraefikRouter } from "@/lib/types";

const PROTOCOLS: { key: Protocol; label: string }[] = [
  { key: "http", label: "HTTP" },
  { key: "tcp", label: "TCP" },
  { key: "udp", label: "UDP" },
];

export function RoutersView({
  routers,
  owned,
  entryPoints,
  knownServices,
  knownMiddlewares,
}: {
  routers: Record<Protocol, TraefikRouter[]>;
  /** Nomes (sem @provider) que vivem no arquivo deste painel, por protocolo. */
  owned: Record<Protocol, string[]>;
  entryPoints: string[];
  knownServices: string[];
  knownMiddlewares: string[];
}) {
  const nav = useNextRouter();
  const [proto, setProto] = useState<Protocol>("http");
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [flash, setFlash] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const rows = routers[proto];

  async function remove(name: string) {
    if (!confirm(`Remover o router "${name}"? Um backup do arquivo será mantido.`)) return;
    const res = await deleteResource(proto, "routers", name);
    setFlash(
      res.ok
        ? { tone: "info", text: `"${name}" removido. O Traefik recarrega em instantes.` }
        : { tone: "error", text: res.error ?? "falha ao remover" },
    );
    if (res.ok) nav.refresh();
  }

  const columns: Column<TraefikRouter>[] = [
    {
      key: "status",
      header: "",
      headClassName: "w-8",
      className: "w-8 pr-0",
      render: (r) => <StatusMark status={r.status} />,
      sortValue: (r) => r.status ?? "",
    },
    {
      key: "name",
      header: "Nome",
      sortValue: (r) => r.name,
      render: (r) => <span className="font-mono text-[13.5px] font-medium text-fg">{r.name}</span>,
    },
    {
      key: "rule",
      header: "Regra",
      className: "max-w-[380px]",
      render: (r) => (r.rule ? <Mono className="break-all">{r.rule}</Mono> : <span className="text-muted">—</span>),
      sortValue: (r) => r.rule ?? "",
    },
    {
      key: "entryPoints",
      header: "Entrypoints",
      render: (r) => (
        <span className="flex flex-wrap gap-1">
          {(r.entryPoints ?? []).map((e) => (
            <Badge key={e}>{e}</Badge>
          ))}
        </span>
      ),
    },
    {
      key: "service",
      header: "Service",
      render: (r) =>
        r.service ? (
          <Link
            href={`/services?q=${encodeURIComponent(r.service)}`}
            className="font-mono text-[13px] text-muted underline-offset-4 transition-colors hover:text-red hover:underline"
          >
            {r.service}
          </Link>
        ) : (
          <span className="text-muted">—</span>
        ),
      sortValue: (r) => r.service ?? "",
    },
    {
      key: "tls",
      header: "TLS",
      render: (r) => (r.tls ? <Badge tone="ok" Icon={Lock}>tls</Badge> : <span className="text-muted/40">—</span>),
      sortValue: (r) => (r.tls ? 1 : 0),
    },
    {
      key: "provider",
      header: "Provider",
      render: (r) => {
        const Icon = providerIcon(r.provider);
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Icon size={13} strokeWidth={2} aria-hidden />
            {r.provider ?? "—"}
          </span>
        );
      },
      sortValue: (r) => r.provider ?? "",
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-20",
      className: "w-20",
      render: (r) =>
        isEditable(r.name, owned[proto]) ? (
          <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <IconButton Icon={Pencil} label={`Editar ${r.name}`} onClick={() => setTarget({ name: r.name })} />
            <IconButton
              Icon={Trash2}
              label={`Remover ${r.name}`}
              className="hover:text-red"
              onClick={() => void remove(r.name)}
            />
          </span>
        ) : (
          <span
            className="text-[10px] uppercase tracking-[0.14em] text-muted/40"
            title={
              r.provider === "file"
                ? "Definido em outro arquivo do file provider — este painel só escreve no seu próprio"
                : `Gerenciado pelo provider ${r.provider ?? "desconhecido"} — edite na origem`
            }
          >
            somente leitura
          </span>
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
          counts={{ http: routers.http.length, tcp: routers.tcp.length, udp: routers.udp.length }}
        />
        <Button className="px-5 py-2.5" onClick={() => setTarget({})}>
          <Plus size={14} strokeWidth={2.6} aria-hidden />
          Novo router
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
          rowKey={(r) => r.name}
          searchable={(r) => [r.name, r.rule, r.service, r.provider, ...(r.entryPoints ?? [])]}
          filters={[
            { key: "provider", label: "Provider", value: (r) => r.provider },
            { key: "status", label: "Estado", value: (r) => r.status },
          ]}
          emptyTitle={`Nenhum router ${proto.toUpperCase()}`}
          emptyHint="Ajuste a busca ou os filtros, ou crie um novo."
          emptyIcon={Route}
          detail={(r) => (
            <DetailGrid>
              <DetailItem label="Regra completa">
                {r.rule ? <Mono className="break-all">{r.rule}</Mono> : "—"}
              </DetailItem>
              <DetailItem label="Middlewares">
                {r.middlewares?.length ? (
                  <span className="flex flex-wrap gap-1">
                    {r.middlewares.map((m) => (
                      <Badge key={m}>{m}</Badge>
                    ))}
                  </span>
                ) : (
                  "nenhum"
                )}
              </DetailItem>
              <DetailItem label="Prioridade">{r.priority ?? "padrão"}</DetailItem>
              <DetailItem label="TLS">
                {r.tls ? (
                  <span className="space-y-0.5">
                    <span className="block">resolver: {r.tls.certResolver ?? "—"}</span>
                    <span className="block">options: {r.tls.options ?? "default"}</span>
                    {r.tls.passthrough != null && <span className="block">passthrough: {String(r.tls.passthrough)}</span>}
                  </span>
                ) : (
                  "desativado"
                )}
              </DetailItem>
              {r.error?.length ? (
                <DetailItem label="Erros">
                  <ul className="space-y-1 text-red">
                    {r.error.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </DetailItem>
              ) : null}
            </DetailGrid>
          )}
        />
      </div>

      <ResourceEditor
        kind="routers"
        section={proto}
        target={target}
        onClose={() => setTarget(null)}
        entryPoints={entryPoints}
        knownServices={knownServices}
        knownMiddlewares={knownMiddlewares}
      />
    </>
  );
}
