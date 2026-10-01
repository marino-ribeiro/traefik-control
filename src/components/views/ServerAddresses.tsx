"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Globe, Network } from "lucide-react";
import { IconButton, Panel, cx } from "@/components/ui/primitives";
import type { ServerAddresses as Addresses } from "@/lib/server-addresses";

/**
 * Endereços do servidor para apontamento DNS, com botão de copiar. Busca
 * pela API em vez de vir no render da página: o IP público depende de um
 * serviço externo, e a Visão geral não deve esperar por ele.
 */
export function ServerAddresses() {
  const [data, setData] = useState<Addresses | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/server/addresses", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Addresses;
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel eyebrow="Para apontamentos DNS" title="Endereços do servidor" Icon={Globe} className="mb-3">
      <dl className="grid divide-y divide-white/8 md:grid-cols-3 md:divide-x md:divide-y-0">
        <Slot label="IP público · IPv4" hint="registro A">
          {data ? (
            <Value value={data.public.v4} missing={publicMissing(data, "IPv4")} />
          ) : (
            <Pending failed={failed} />
          )}
        </Slot>
        <Slot label="IP público · IPv6" hint="registro AAAA">
          {data ? (
            <Value value={data.public.v6} missing={publicMissing(data, "IPv6")} />
          ) : (
            <Pending failed={failed} />
          )}
        </Slot>
        <Slot label="IP interno" hint="rede local" Icon={Network}>
          {data ? (
            data.internal.addresses.length > 0 ? (
              <ul className="space-y-1.5">
                {data.internal.addresses.map((a) => (
                  <li key={a.address}>
                    <Value value={a.address} note={a.iface} />
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[13px] text-muted">nenhuma interface de rede encontrada</span>
            )
          ) : (
            <Pending failed={failed} />
          )}
        </Slot>
      </dl>

      {data && <Footnote data={data} />}
    </Panel>
  );
}

function publicMissing(data: Addresses, family: string): string {
  switch (data.public.source) {
    case "disabled":
      return "consulta desligada (PUBLIC_IP_LOOKUP=0)";
    case "failed":
      return "não consegui descobrir — sem saída para a internet?";
    case "env":
      return `não informado em SERVER_PUBLIC_IP`;
    default:
      return family === "IPv6" ? "sem IPv6 público de saída" : "não encontrado";
  }
}

function Footnote({ data }: { data: Addresses }) {
  const notes: string[] = [];
  if (data.public.source === "lookup") {
    notes.push("IP público descoberto via api.ipify.org (atualiza a cada 10 min). Fixe com SERVER_PUBLIC_IP.");
  } else if (data.public.source === "env") {
    notes.push("IP público definido em SERVER_PUBLIC_IP.");
  }
  if (data.internal.source === "env") {
    notes.push("IP interno definido em SERVER_INTERNAL_IP.");
  } else if (data.inContainer) {
    notes.push(
      "O painel roda num container: o IP interno acima é o do container, não o da máquina. " +
        "Informe o IP da máquina em SERVER_INTERNAL_IP.",
    );
  }
  if (notes.length === 0) return null;
  return (
    <div className="border-t border-white/8 px-6 py-3">
      {notes.map((n) => (
        <p
          key={n}
          className={cx("text-[12px] leading-relaxed", n.startsWith("O painel roda") ? "text-warn" : "text-muted")}
        >
          {n}
        </p>
      ))}
    </div>
  );
}

function Slot({
  label,
  hint,
  Icon,
  children,
}: {
  label: string;
  hint: string;
  Icon?: typeof Globe;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-5">
      <dt className="mb-2 flex items-center gap-2">
        {Icon && <Icon size={13} className="text-muted" aria-hidden />}
        <span className="label-caps">{label}</span>
        <span className="text-[11px] text-muted/60">{hint}</span>
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Pending({ failed }: { failed: boolean }) {
  return failed ? (
    <span className="text-[13px] text-muted">não foi possível carregar</span>
  ) : (
    <span className="block h-6 w-36 rounded-control bg-white/[0.06] motion-safe:animate-pulse" aria-label="carregando" />
  );
}

function Value({ value, missing, note }: { value: string | null; missing?: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-[13px] text-muted">{missing}</span>;

  async function copy() {
    if (!value) return;
    if (await copyText(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <code className="break-all font-mono text-[15px] text-fg">{value}</code>
      {note && <span className="font-mono text-[11px] text-muted/60">{note}</span>}
      <IconButton
        Icon={copied ? Check : Copy}
        label={copied ? "Copiado" : `Copiar ${value}`}
        onClick={() => void copy()}
        className={cx("size-7 shrink-0", copied && "text-ok hover:text-ok")}
      />
      <span className="sr-only" aria-live="polite">
        {copied ? "Copiado" : ""}
      </span>
    </span>
  );
}

/**
 * `navigator.clipboard` só existe em contexto seguro (https ou localhost);
 * acessando o painel por http puro, cai no método antigo via textarea.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* tenta o método antigo abaixo */
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    el.remove();
  }
}
