"use client";

import { useState } from "react";
import { Button, EmptyState, Mono, Notice, Panel, cx } from "@/components/ui/primitives";
import { diffLines, hunks, type DiffHunk } from "@/lib/line-diff";

/** `dynamic-2026-10-01T17-54-07-361Z-64bc581a.yml.bak` → a data da gravação. */
function stampOf(name: string): Date | null {
  const m = name.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ago(d: Date): string {
  const s = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return "agora há pouco";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} dia(s)`;
}

interface Opened {
  name: string;
  /** null = diff grande demais para calcular no navegador. */
  hunks: DiffHunk[] | null;
  added: number;
  removed: number;
}

/**
 * Lista os backups que cada gravação deixa em `.backups/` e restaura um
 * deles — sempre mostrando antes o que muda. O backup guarda a versão
 * ANTERIOR à gravação, então "restaurar" o mais recente desfaz a última
 * alteração. Restaurar também vira backup: dá para voltar atrás.
 */
export function BackupsPanel({
  backups,
  current,
  onRestored,
}: {
  backups: string[];
  current: string;
  onRestored: (text: string) => void;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(name: string) {
    if (opened?.name === name) return setOpened(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/config/backup?${new URLSearchParams({ name })}`, { cache: "no-store" });
      const body = (await res.json()) as { raw?: string; error?: string };
      if (!res.ok || typeof body.raw !== "string") throw new Error(body.error ?? `falha ${res.status}`);
      /* Do atual para o backup: "-" é o que some ao restaurar, "+" o que volta. */
      const lines = diffLines(current, body.raw);
      setOpened({
        name,
        hunks: lines ? hunks(lines) : null,
        added: lines?.filter((l) => l.op === "add").length ?? 0,
        removed: lines?.filter((l) => l.op === "del").length ?? 0,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    const when = stampOf(name);
    const label = when ? when.toLocaleString("pt-BR") : name;
    if (!confirm(`Restaurar a versão de ${label}? A versão atual fica guardada como backup.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/config/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, base: current }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `falha ${res.status}`);
      setOpened(null);
      onRestored(`Versão de ${label} restaurada. O Traefik recarrega em instantes.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel eyebrow="Histórico" title="Backups do arquivo">
      <div className="px-6 pt-5">
        <p className="text-[13px] text-muted">
          Cada gravação guarda a versão <strong className="text-fg">anterior</strong> em <Mono>.backups/</Mono> (as
          20 mais recentes). Restaurar o mais recente desfaz a última alteração, e a restauração também vira backup.
        </p>
        {error && (
          <div className="mt-4">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
      </div>

      {backups.length === 0 ? (
        <EmptyState title="Nenhum backup ainda" hint="O primeiro aparece na primeira gravação feita pelo painel." />
      ) : (
        <ul className="mt-4">
          {backups.map((name) => {
            const when = stampOf(name);
            const isOpen = opened?.name === name;
            return (
              <li key={name} className="border-t border-white/6 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="block text-[14px] font-medium text-fg">
                      {when ? when.toLocaleString("pt-BR") : name}
                      {when && <span className="ml-2 text-[12px] font-normal text-muted">{ago(when)}</span>}
                    </span>
                    <span className="block truncate font-mono text-[11.5px] text-muted/60">{name}</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" className="px-4 py-2" onClick={() => void open(name)} disabled={busy}>
                      {isOpen ? "Fechar" : "Comparar"}
                    </Button>
                    {isOpen && (opened.added > 0 || opened.removed > 0) && (
                      <Button className="px-4 py-2" onClick={() => void restore(name)} disabled={busy}>
                        Restaurar esta versão
                      </Button>
                    )}
                  </div>
                </div>
                {isOpen && <DiffView opened={opened} />}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function DiffView({ opened }: { opened: Opened }) {
  if (opened.hunks === null) {
    return (
      <div className="mt-4">
        <Notice tone="warn">Arquivo grande demais para comparar no navegador — confira pelo servidor.</Notice>
      </div>
    );
  }
  if (opened.added === 0 && opened.removed === 0) {
    return <p className="mt-4 text-[13px] text-muted">Idêntico ao arquivo atual: nada a restaurar.</p>;
  }
  return (
    <div className="mt-4">
      <p className="mb-2 text-[12px] text-muted">
        Ao restaurar: <span className="text-ok">+{opened.added} linha(s) voltam</span> ·{" "}
        <span className="text-red">−{opened.removed} saem</span>
      </p>
      <div className="overflow-x-auto rounded-control border border-white/8 bg-black/50 py-2 font-mono text-[12px] leading-[1.6]">
        {opened.hunks.map((h, hi) => (
          <div key={hi}>
            {h.skippedBefore > 0 && (
              <div className="px-4 text-muted/50">⋯ {h.skippedBefore} linha(s) iguais</div>
            )}
            {h.lines.map((l, li) => (
              <div
                key={li}
                className={cx(
                  "whitespace-pre px-4",
                  l.op === "add" && "bg-ok/10 text-ok",
                  l.op === "del" && "bg-red/10 text-red",
                  l.op === "same" && "text-muted",
                )}
              >
                {l.op === "add" ? "+ " : l.op === "del" ? "− " : "  "}
                {l.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
