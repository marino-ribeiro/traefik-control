"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, EmptyState, Mono, Notice, Panel, cx } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/primitives";
import {
  MiddlewareForm,
  RouterForm,
  ServiceForm,
  type RouterValue,
  type ServiceValue,
} from "./manage-forms";
import type { DynamicConfig, Kind, Section } from "@/lib/config-store";

type Tab = "routers" | "services" | "middlewares" | "yaml";

const TABS: { key: Tab; label: string }[] = [
  { key: "routers", label: "Routers" },
  { key: "services", label: "Services" },
  { key: "middlewares", label: "Middlewares" },
  { key: "yaml", label: "YAML bruto" },
];

interface Editing {
  name?: string;
  value?: Record<string, unknown>;
}

export function ManageView({
  config,
  raw,
  entryPoints,
  knownServices,
  knownMiddlewares,
}: {
  config: DynamicConfig;
  raw: string;
  entryPoints: string[];
  knownServices: string[];
  knownMiddlewares: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("routers");
  const [section, setSection] = useState<Section>("http");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const kind = (tab === "yaml" ? "routers" : tab) as Kind;
  const bucket = ((config[section] as Record<string, Record<string, unknown>> | undefined)?.[kind] ??
    {}) as Record<string, Record<string, unknown>>;
  const names = Object.keys(bucket).sort();

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function save(name: string, value: unknown, rename?: string) {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch("/api/config/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, kind, name, value, rename }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `falha ${res.status}`);
      setEditing(null);
      setFlash({ tone: "info", text: `"${name}" gravado. O Traefik recarrega em instantes.` });
      refresh();
    } catch (err) {
      setFlash({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Remover "${name}" de ${section}.${kind}? Um backup do arquivo será mantido.`)) return;
    setBusy(true);
    setFlash(null);
    try {
      const qs = new URLSearchParams({ section, kind, name });
      const res = await fetch(`/api/config/entry?${qs}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `falha ${res.status}`);
      setFlash({ tone: "info", text: `"${name}" removido.` });
      refresh();
    } catch (err) {
      setFlash({ tone: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const sectionsFor: Section[] = tab === "middlewares" ? ["http", "tcp"] : ["http", "tcp", "udp"];

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-px" role="tablist" aria-label="Tipo de objeto">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key === "middlewares" && section === "udp") setSection("http");
              }}
              className={cx(
                "rounded-control border px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 ease-geist",
                tab === t.key
                  ? "btn-grad border-red text-fg shadow-red"
                  : "glass-tile text-muted hover:text-fg",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab !== "yaml" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-px">
              {sectionsFor.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSection(s)}
                  className={cx(
                    "rounded-control border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 ease-geist",
                    section === s
                      ? "glass-tile text-fg"
                      : "border-white/10 text-muted hover:text-fg",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Button onClick={() => setEditing({})} className="px-5 py-2.5">
              + Novo
            </Button>
          </div>
        )}
      </div>

      {flash && (
        <div className="mb-4">
          <Notice tone={flash.tone === "error" ? "error" : "info"}>{flash.text}</Notice>
        </div>
      )}

      {tab === "yaml" ? (
        <YamlEditor raw={raw} onSaved={(t) => { setFlash({ tone: "info", text: t }); refresh(); }} />
      ) : (
        <Panel>
          {names.length === 0 ? (
            <EmptyState
              title={`Nenhum ${kind.slice(0, -1)} em ${section}`}
              hint='Clique em "+ Novo" para criar o primeiro neste arquivo.'
            />
          ) : (
            <ul>
              {names.map((name) => (
                <li
                  key={name}
                  className="flex flex-wrap items-start justify-between gap-4 border-b border-white/6 px-6 py-5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[14px] font-medium text-fg">{name}</span>
                      <Badge>{section}</Badge>
                      {kind === "middlewares" && (
                        <Badge tone="orange">{Object.keys(bucket[name] ?? {})[0] ?? "?"}</Badge>
                      )}
                    </div>
                    <p className="mt-1.5 truncate font-mono text-[12.5px] text-muted">
                      {summarize(kind, bucket[name])}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-px">
                    <Button
                      variant="ghost"
                      className="px-4 py-2"
                      onClick={() => setEditing({ name, value: bucket[name] })}
                    >
                      Editar
                    </Button>
                    <Button variant="danger" className="px-4 py-2" onClick={() => remove(name)} disabled={busy}>
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        eyebrow={`${section} · ${kind}`}
        title={editing?.name ? `Editar ${editing.name}` : `Novo ${kind.slice(0, -1)}`}
        width="620px"
      >
        {editing !== null && kind === "routers" && (
          <RouterForm
            initialName={editing.name}
            initial={editing.value as RouterValue}
            entryPoints={entryPoints}
            services={knownServices}
            middlewares={knownMiddlewares}
            busy={busy}
            onSubmit={(name, value) => save(name, value, editing.name)}
          />
        )}
        {editing !== null && kind === "services" && (
          <ServiceForm
            initialName={editing.name}
            initial={editing.value as ServiceValue}
            section={section === "udp" ? "tcp" : section}
            busy={busy}
            onSubmit={(name, value) => save(name, value, editing.name)}
          />
        )}
        {editing !== null && kind === "middlewares" && (
          <MiddlewareForm
            initialName={editing.name}
            initial={editing.value}
            busy={busy}
            onSubmit={(name, value) => save(name, value, editing.name)}
          />
        )}
      </Modal>
    </>
  );
}

/** One-line preview of an entry, so the list is scannable without expanding. */
function summarize(kind: Kind, value: Record<string, unknown> | undefined): string {
  if (!value) return "—";
  if (kind === "routers") {
    const r = value as RouterValue;
    return [r.rule, r.service && `→ ${r.service}`].filter(Boolean).join("  ") || "—";
  }
  if (kind === "services") {
    const servers = (value as ServiceValue).loadBalancer?.servers ?? [];
    return servers.map((s) => s.url ?? s.address).filter(Boolean).join(", ") || "sem servidores";
  }
  return JSON.stringify(Object.values(value)[0] ?? {});
}

function YamlEditor({ raw, onSaved }: { raw: string; onSaved: (text: string) => void }) {
  const [text, setText] = useState(raw);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = text !== raw;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: text }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `falha ${res.status}`);
      onSaved("Arquivo gravado. O Traefik recarrega em instantes.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      eyebrow="Edição direta"
      title="dynamic.yml"
      action={
        <div className="flex items-center gap-3">
          {dirty && <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-warn">alterado</span>}
          <Button variant="ghost" className="px-4 py-2" onClick={() => setText(raw)} disabled={!dirty || busy}>
            Descartar
          </Button>
          <Button className="px-5 py-2.5" onClick={save} disabled={!dirty || busy}>
            {busy ? "Gravando…" : "Gravar"}
          </Button>
        </div>
      }
    >
      <div className="px-6 py-6">
        <Textarea
          rows={26}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={"http:\n  routers:\n    exemplo:\n      rule: Host(`app.exemplo.com`)\n      service: exemplo"}
        />
        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <p className="mt-4 text-[13px] text-muted">
          O YAML é validado antes de tocar no disco, a escrita é atômica e a versão anterior vira backup em{" "}
          <Mono>.backups/</Mono>.
        </p>
      </div>
    </Panel>
  );
}
