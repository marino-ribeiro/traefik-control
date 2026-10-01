"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Button, EmptyState, Mono, Notice, Panel, cx } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { CodeEditor } from "@/components/ui/CodeEditor";
import { ReadOnlyMark } from "./ResourceEditor";
import { BackupsPanel } from "./BackupsPanel";
import {
  MiddlewareForm,
  RouterForm,
  ServiceForm,
  TransportForm,
  type RouterValue,
  type ServiceValue,
  type TransportValue,
} from "./manage-forms";
import type { DynamicConfig, Kind, Section } from "@/lib/config-store";

type Tab = "routers" | "services" | "middlewares" | "serversTransports" | "yaml" | "backups";

const TABS: { key: Tab; label: string }[] = [
  { key: "routers", label: "Routers" },
  { key: "services", label: "Services" },
  { key: "middlewares", label: "Middlewares" },
  { key: "serversTransports", label: "Transports" },
  { key: "yaml", label: "YAML bruto" },
  { key: "backups", label: "Backups" },
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
  locked,
  backups,
}: {
  config: DynamicConfig;
  raw: string;
  entryPoints: string[];
  knownServices: string[];
  knownMiddlewares: string[];
  /** Protegidos por UI_PROTECTED: sem editar/remover aqui. */
  locked: Record<Section, Record<Kind, string[]>>;
  /** Nomes em `.backups/`, do mais recente para o mais antigo. */
  backups: string[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("routers");
  const [section, setSection] = useState<Section>("http");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const kind = (tab === "yaml" || tab === "backups" ? "routers" : tab) as Kind;
  const bucket = ((config[section] as Record<string, Record<string, unknown>> | undefined)?.[kind] ??
    {}) as Record<string, Record<string, unknown>>;
  const names = Object.keys(bucket).sort();
  const isLocked = (name: string) => locked[section]?.[kind]?.includes(name) ?? false;

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

  const sectionsFor: Section[] =
    tab === "serversTransports" ? ["http"] : tab === "middlewares" ? ["http", "tcp"] : ["http", "tcp", "udp"];
  const transports = Object.keys(config.http?.serversTransports ?? {}).sort();
  const transportOf = Object.fromEntries(
    Object.entries(config.http?.services ?? {}).flatMap(([svc, v]) => {
      const ref = (v as ServiceValue)?.loadBalancer?.serversTransport;
      return typeof ref === "string" ? [[svc, ref.split("@")[0]]] : [];
    }),
  );

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="Tipo de objeto">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key === "middlewares" && section === "udp") setSection("http");
                if (t.key === "serversTransports") setSection("http");
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

        {tab !== "yaml" && tab !== "backups" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
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

      {tab === "backups" ? (
        <BackupsPanel
          backups={backups}
          current={raw}
          onRestored={(t) => {
            setFlash({ tone: "info", text: t });
            refresh();
          }}
        />
      ) : tab === "yaml" ? (
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
                      {isLocked(name) && <ReadOnlyMark locked />}
                    </div>
                    <p className="mt-1.5 truncate font-mono text-[12.5px] text-muted">
                      {summarize(kind, bucket[name], name, transportOf)}
                    </p>
                  </div>
                  {!isLocked(name) && (
                    <div className="flex shrink-0 gap-2">
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
                  )}
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
            transports={transports}
            busy={busy}
            onSubmit={(name, value) => save(name, value, editing.name)}
          />
        )}
        {editing !== null && kind === "serversTransports" && (
          <TransportForm
            initialName={editing.name}
            initial={editing.value as TransportValue}
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
function summarize(
  kind: Kind,
  value: Record<string, unknown> | undefined,
  name?: string,
  /** service → transport que ele usa, para mostrar quem depende de cada um. */
  usersOf?: Record<string, string>,
): string {
  if (!value) return "—";
  if (kind === "routers") {
    const r = value as RouterValue;
    return [r.rule, r.service && `→ ${r.service}`].filter(Boolean).join("  ") || "—";
  }
  if (kind === "services") {
    const lb = (value as ServiceValue).loadBalancer;
    const servers = (lb?.servers ?? []).map((s) => s.url ?? s.address).filter(Boolean).join(", ") || "sem servidores";
    return lb?.serversTransport ? `${servers}  via ${lb.serversTransport}` : servers;
  }
  if (kind === "serversTransports") {
    const t = value as TransportValue;
    const users = Object.entries(usersOf ?? {})
      .filter(([, ref]) => ref === name)
      .map(([svc]) => svc);
    return (
      [
        t.insecureSkipVerify && "sem validar certificado",
        t.serverName && `SNI ${t.serverName}`,
        t.rootCAs?.length && `${t.rootCAs.length} CA(s)`,
        t.forwardingTimeouts && "timeouts próprios",
      ]
        .filter(Boolean)
        .join(" · ") || "padrões do Traefik"
    ) + `  — usado por ${users.length ? users.join(", ") : "nenhum service"}`;
  }
  return JSON.stringify(Object.values(value)[0] ?? {});
}

function YamlEditor({ raw, onSaved }: { raw: string; onSaved: (text: string) => void }) {
  /* `base` = a versão do disco sobre a qual o texto está sendo editado. É ela
     que vai junto na gravação: se o arquivo mudou por fora, o servidor recusa
     em vez de apagar a mudança alheia. */
  const [base, setBase] = useState(raw);
  const [text, setText] = useState(raw);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Versão atual do disco, quando a gravação deu conflito. */
  const [conflict, setConflict] = useState<string | null>(null);
  const dirty = text !== base;

  /* Recarregou a página (ou gravou) e o disco mudou: sem edição pendente,
     acompanha o disco; com edição pendente, mantém o texto e deixa o
     servidor acusar o conflito na hora de gravar. */
  const [seenRaw, setSeenRaw] = useState(raw);
  if (raw !== seenRaw) {
    setSeenRaw(raw);
    if (!dirty) {
      setBase(raw);
      setText(raw);
    }
  }

  async function save(over?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: text, base: over ?? base }),
      });
      const body = (await res.json()) as { error?: string; current?: string };
      if (res.status === 409 && typeof body.current === "string") {
        setConflict(body.current);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? `falha ${res.status}`);
      setConflict(null);
      setBase(text);
      onSaved("Arquivo gravado. O Traefik recarrega em instantes.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function loadDisk() {
    if (conflict === null) return;
    setBase(conflict);
    setText(conflict);
    setConflict(null);
  }

  return (
    <Panel
      eyebrow="Edição direta"
      title="dynamic.yml"
      action={
        <div className="flex items-center gap-3">
          {dirty && <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-warn">alterado</span>}
          <Button variant="ghost" className="px-4 py-2" onClick={() => setText(base)} disabled={!dirty || busy}>
            Descartar
          </Button>
          <Button className="px-5 py-2.5" onClick={() => void save()} disabled={!dirty || busy || conflict !== null}>
            {busy ? "Gravando…" : "Gravar"}
          </Button>
        </div>
      }
    >
      <div className="px-6 py-6">
        <CodeEditor
          language="yaml"
          rows={26}
          value={text}
          onChange={setText}
          ariaLabel="Conteúdo do dynamic.yml"
          placeholder={"http:\n  routers:\n    exemplo:\n      rule: Host(`app.exemplo.com`)\n      service: exemplo"}
        />
        {conflict !== null && (
          <div className="mt-4 space-y-3">
            <Notice tone="warn">
              O arquivo mudou no disco desde que você abriu o editor — uma edição feita por fora ou em outra aba.
              Gravar agora apagaria essa mudança. Escolha o que fazer:
            </Notice>
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost" className="px-4 py-2" onClick={loadDisk} disabled={busy}>
                Usar a versão do disco
              </Button>
              <Button variant="danger" className="px-4 py-2" onClick={() => void save(conflict)} disabled={busy}>
                Gravar a minha por cima
              </Button>
            </div>
            <p className="text-[12px] text-muted">
              &ldquo;Usar a versão do disco&rdquo; descarta o que você digitou — copie antes o que quiser manter.
              &ldquo;Gravar por cima&rdquo; substitui a versão do disco, que fica salva em backup.
            </p>
          </div>
        )}
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
