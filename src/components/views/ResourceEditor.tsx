"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/primitives";
import { MiddlewareForm, RouterForm, ServiceForm, type RouterValue, type ServiceValue } from "./manage-forms";
import type { Kind, Section } from "@/lib/config-store";

/** Nome sem o sufixo `@provider` — dentro do arquivo ele não existe. */
export function bare(name: string): string {
  return name.split("@")[0];
}

/**
 * Editável = presente no arquivo que ESTE painel escreve.
 *
 * `provider === "file"` não serve: o file provider do Traefik pode observar
 * um diretório inteiro, e objetos definidos em outros arquivos aparecem com
 * o mesmo provider mas não estão sob nossa gestão — clicar em editar daria
 * 404, e salvar criaria uma entrada duplicada no nosso arquivo.
 */
export function isEditable(name: string, owned: string[]): boolean {
  return owned.includes(bare(name));
}

/**
 * Marca da coluna de ações quando não dá para editar. Protegido (ver
 * `UI_PROTECTED`) ganha cadeado e explicação própria: é do painel, não de
 * outro provider.
 */
export function ReadOnlyMark({ provider, locked }: { provider?: string; locked: boolean }) {
  if (locked) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-warn/80"
        title="Protegido: é por esta entrada que o painel fica no ar. Altere pelo servidor (ou tire de UI_PROTECTED)."
      >
        <Lock size={11} strokeWidth={2.2} aria-hidden />
        protegido
      </span>
    );
  }
  return (
    <span
      className="text-[10px] uppercase tracking-[0.14em] text-muted/40"
      title={
        provider === "file"
          ? "Definido em outro arquivo do file provider — este painel só escreve no seu próprio"
          : `Gerenciado pelo provider ${provider ?? "desconhecido"} — edite na origem`
      }
    >
      somente leitura
    </span>
  );
}

export interface EditorTarget {
  /** Ausente = criação. */
  name?: string;
}

/**
 * Modal de edição compartilhado pelas telas de recurso.
 *
 * O valor atual é buscado no arquivo sob demanda: as telas de listagem
 * recebem o estado RESOLVIDO da API do Traefik, que não é o mesmo que está
 * escrito no YAML (a API já expandiu defaults e anexou @provider). Editar
 * a partir do resolvido reescreveria o arquivo com coisas que o usuário
 * nunca digitou.
 */
export function ResourceEditor({
  kind,
  section,
  target,
  onClose,
  entryPoints = [],
  knownServices = [],
  knownMiddlewares = [],
  knownTransports = [],
}: {
  kind: Kind;
  section: Section;
  target: EditorTarget | null;
  onClose: () => void;
  entryPoints?: string[];
  knownServices?: string[];
  knownMiddlewares?: string[];
  knownTransports?: string[];
}) {
  const editingName = target?.name ? bare(target.name) : undefined;
  const singular =
    kind === "routers" ? "router" : kind === "services" ? "service" : kind === "middlewares" ? "middleware" : "transport";

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      eyebrow={`${section} · ${kind}`}
      title={editingName ? `Editar ${editingName}` : `Novo ${singular}`}
      width="620px"
    >
      {/* Montado só com alvo e re-montado a cada nome: todo o estado interno
          (valor carregado, erro, busy) nasce limpo, sem reset em efeito. */}
      {target !== null && (
        <EditorBody
          key={`${kind}:${section}:${editingName ?? "novo"}`}
          kind={kind}
          section={section}
          editingName={editingName}
          onClose={onClose}
          entryPoints={entryPoints}
          knownServices={knownServices}
          knownMiddlewares={knownMiddlewares}
          knownTransports={knownTransports}
        />
      )}
    </Modal>
  );
}

function EditorBody({
  kind,
  section,
  editingName,
  onClose,
  entryPoints,
  knownServices,
  knownMiddlewares,
  knownTransports,
}: {
  kind: Kind;
  section: Section;
  editingName?: string;
  onClose: () => void;
  entryPoints: string[];
  knownServices: string[];
  knownMiddlewares: string[];
  knownTransports: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<Record<string, unknown> | undefined>();
  const [loading, setLoading] = useState(Boolean(editingName));

  useEffect(() => {
    if (!editingName) return;
    let cancelled = false;

    void (async () => {
      try {
        /* Pede o objeto já parseado: embarcar o parser de YAML no cliente
           só para prefilar um formulário não se paga. */
        const qs = new URLSearchParams({ section, kind, name: editingName });
        const res = await fetch(`/api/config/entry/resolve?${qs}`, { cache: "no-store" });
        const body = (await res.json()) as { value?: Record<string, unknown>; error?: string };
        if (!res.ok) throw new Error(body.error ?? `falha ${res.status}`);
        if (!cancelled) setValue(body.value);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [editingName, section, kind]);

  const save = useCallback(
    async (name: string, next: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/config/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ section, kind, name, value: next, rename: editingName }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `falha ${res.status}`);
        onClose();
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [section, kind, editingName, onClose, router],
  );

  if (loading) {
    return <p className="py-8 text-center text-[14px] text-muted">Carregando a definição do arquivo…</p>;
  }

  return (
    <>
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {kind === "routers" && (
        <RouterForm
          initialName={editingName}
          initial={value as RouterValue | undefined}
          entryPoints={entryPoints}
          services={knownServices}
          middlewares={knownMiddlewares}
          busy={busy}
          onSubmit={save}
        />
      )}
      {kind === "services" && (
        <ServiceForm
          initialName={editingName}
          initial={value as ServiceValue | undefined}
          section={section === "udp" ? "tcp" : section}
          transports={knownTransports}
          busy={busy}
          onSubmit={save}
        />
      )}
      {kind === "middlewares" && (
        <MiddlewareForm initialName={editingName} initial={value} busy={busy} onSubmit={save} />
      )}
    </>
  );
}

/** Remoção com confirmação, compartilhada pelas telas. */
export async function deleteResource(
  section: Section,
  kind: Kind,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const qs = new URLSearchParams({ section, kind, name: bare(name) });
  try {
    const res = await fetch(`/api/config/entry?${qs}`, { method: "DELETE" });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? `falha ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
