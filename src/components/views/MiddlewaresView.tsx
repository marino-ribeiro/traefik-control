"use client";

import { useRouter as useNextRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, Button, IconButton, Notice, StatusMark } from "@/components/ui/primitives";
import { Layers, providerIcon } from "@/components/ui/icons";
import { DetailGrid, DetailItem } from "./ProtocolTabs";
import { ResourceEditor, deleteResource, isEditable, type EditorTarget } from "./ResourceEditor";
import type { TraefikMiddleware } from "@/lib/types";

/** Keys that are metadata rather than middleware configuration. */
const META_KEYS = new Set(["name", "provider", "status", "type", "error", "usedBy"]);

function configOf(m: TraefikMiddleware): Record<string, unknown> {
  return Object.fromEntries(Object.entries(m).filter(([k]) => !META_KEYS.has(k)));
}

export function MiddlewaresView({
  middlewares,
  owned,
}: {
  middlewares: TraefikMiddleware[];
  owned: string[];
}) {
  const nav = useNextRouter();
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [flash, setFlash] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function remove(name: string) {
    if (!confirm(`Remover o middleware "${name}"? Um backup do arquivo será mantido.`)) return;
    const res = await deleteResource("http", "middlewares", name);
    setFlash(
      res.ok
        ? { tone: "info", text: `"${name}" removido. O Traefik recarrega em instantes.` }
        : { tone: "error", text: res.error ?? "falha ao remover" },
    );
    if (res.ok) nav.refresh();
  }

  const columns: Column<TraefikMiddleware>[] = [
    {
      key: "status",
      header: "",
      headClassName: "w-8",
      className: "w-8 pr-0",
      render: (m) => <StatusMark status={m.status} />,
      sortValue: (m) => m.status ?? "",
    },
    {
      key: "name",
      header: "Nome",
      sortValue: (m) => m.name,
      render: (m) => <span className="font-mono text-[13.5px] font-medium text-fg">{m.name}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      render: (m) => <Badge tone="orange">{m.type ?? "—"}</Badge>,
      sortValue: (m) => m.type ?? "",
    },
    {
      key: "usedBy",
      header: "Usado por",
      render: (m) =>
        m.usedBy?.length ? (
          <span className="flex flex-wrap gap-1">
            {m.usedBy.slice(0, 3).map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
            {m.usedBy.length > 3 && <span className="text-[12px] text-muted">+{m.usedBy.length - 3}</span>}
          </span>
        ) : (
          <span className="text-[13px] text-muted/60">não utilizado</span>
        ),
      sortValue: (m) => m.usedBy?.length ?? 0,
    },
    {
      key: "provider",
      header: "Provider",
      render: (m) => {
        const Icon = providerIcon(m.provider);
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Icon size={13} strokeWidth={2} aria-hidden />
            {m.provider ?? "—"}
          </span>
        );
      },
      sortValue: (m) => m.provider ?? "",
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-20",
      className: "w-20",
      render: (m) =>
        isEditable(m.name, owned) ? (
          <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <IconButton Icon={Pencil} label={`Editar ${m.name}`} onClick={() => setTarget({ name: m.name })} />
            <IconButton
              Icon={Trash2}
              label={`Remover ${m.name}`}
              className="hover:text-red"
              onClick={() => void remove(m.name)}
            />
          </span>
        ) : (
          <span
            className="text-[10px] uppercase tracking-[0.14em] text-muted/40"
            title={
              m.provider === "file"
                ? "Definido em outro arquivo do file provider — este painel só escreve no seu próprio"
                : `Gerenciado pelo provider ${m.provider ?? "desconhecido"} — edite na origem`
            }
          >
            somente leitura
          </span>
        ),
    },
  ];

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button className="px-5 py-2.5" onClick={() => setTarget({})}>
          <Plus size={14} strokeWidth={2.6} aria-hidden />
          Novo middleware
        </Button>
      </div>

      {flash && (
        <div className="mb-3">
          <Notice tone={flash.tone === "error" ? "error" : "info"}>{flash.text}</Notice>
        </div>
      )}

      <div className="glass rounded-panel overflow-hidden">
        <DataTable
        rows={middlewares}
        columns={columns}
        rowKey={(m) => m.name}
        searchable={(m) => [m.name, m.type, m.provider]}
        filters={[
          { key: "type", label: "Tipo", value: (m) => m.type },
          { key: "provider", label: "Provider", value: (m) => m.provider },
        ]}
        emptyTitle="Nenhum middleware"
        emptyIcon={Layers}
        detail={(m) => (
          <DetailGrid>
            <DetailItem label="Configuração">
              <pre className="scroll-slim overflow-x-auto border border-line bg-ink p-4 font-mono text-[12.5px] leading-relaxed text-fg/90">
                {JSON.stringify(configOf(m), null, 2)}
              </pre>
            </DetailItem>
            <DetailItem label="Routers que usam">
              {m.usedBy?.length ? (
                <span className="flex flex-wrap gap-1">
                  {m.usedBy.map((r) => (
                    <Badge key={r}>{r}</Badge>
                  ))}
                </span>
              ) : (
                "nenhum"
              )}
            </DetailItem>
          </DetailGrid>
        )}
        />
      </div>

      <ResourceEditor kind="middlewares" section="http" target={target} onClose={() => setTarget(null)} />
    </>
  );
}
