"use client";

import { useState } from "react";
import { Badge, Button, Checkbox, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui/primitives";
import { CodeEditor } from "@/components/ui/CodeEditor";

/* ================================================================ helpers */

export function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Multi-select rendered as toggle chips — fewer clicks than a <select multiple>. */
function ChipPicker({
  options,
  selected,
  onToggle,
  emptyHint,
}: {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyHint: string;
}) {
  if (options.length === 0) return <p className="text-[13px] text-muted/70">{emptyHint}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            className={cx(
              "rounded-control border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors duration-200 ease-geist",
              on ? "btn-grad border-red text-fg" : "border-white/12 text-muted hover:border-white/25 hover:text-fg",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/* ============================================================ RouterForm */

export interface RouterValue {
  rule?: string;
  entryPoints?: string[];
  service?: string;
  middlewares?: string[];
  priority?: number;
  tls?: Record<string, unknown>;
}

export function RouterForm({
  initialName,
  initial,
  entryPoints,
  services,
  middlewares,
  onSubmit,
  busy,
}: {
  initialName?: string;
  initial?: RouterValue;
  entryPoints: string[];
  services: string[];
  middlewares: string[];
  onSubmit: (name: string, value: RouterValue) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initialName ?? "");
  const [rule, setRule] = useState(initial?.rule ?? "");
  const [eps, setEps] = useState<string[]>(initial?.entryPoints ?? []);
  const [service, setService] = useState(initial?.service ?? "");
  const [mws, setMws] = useState<string[]>(initial?.middlewares ?? []);
  const [priority, setPriority] = useState(initial?.priority != null ? String(initial.priority) : "");
  const [tlsOn, setTlsOn] = useState(initial?.tls != null);
  const [certResolver, setCertResolver] = useState((initial?.tls?.certResolver as string) ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return setError("O nome é obrigatório.");
    if (!rule.trim()) return setError("A regra é obrigatória — ex.: Host(`app.exemplo.com`).");
    if (!service.trim()) return setError("Escolha ou digite o service de destino.");
    if (priority && !Number.isFinite(Number(priority))) return setError("Prioridade precisa ser um número.");
    setError(null);

    const value: RouterValue = { rule: rule.trim(), service: service.trim() };
    if (eps.length) value.entryPoints = eps;
    if (mws.length) value.middlewares = mws;
    if (priority) value.priority = Number(priority);
    if (tlsOn) value.tls = certResolver.trim() ? { certResolver: certResolver.trim() } : {};

    onSubmit(name.trim(), value);
  }

  return (
    <div className="space-y-5">
      <Field label="Nome" hint="Sem o sufixo @file — o Traefik adiciona sozinho.">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-app" autoFocus />
      </Field>

      <Field label="Regra" hint="Sintaxe de matcher do Traefik.">
        <Input
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          placeholder="Host(`app.exemplo.com`) && PathPrefix(`/api`)"
          className="font-mono text-[13px]"
        />
      </Field>

      <Field label="Entrypoints" hint="Vazio = todos os entrypoints.">
        <ChipPicker
          options={entryPoints}
          selected={eps}
          onToggle={(v) => setEps((s) => toggle(s, v))}
          emptyHint="Nenhum entrypoint conhecido — conecte a um Traefik para listá-los."
        />
      </Field>

      <Field label="Service de destino">
        <Input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="meu-app"
          list="known-services"
          className="font-mono text-[13px]"
        />
        <datalist id="known-services">
          {services.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>

      <Field label="Middlewares" hint="A ordem de aplicação segue a ordem de seleção.">
        <ChipPicker
          options={middlewares}
          selected={mws}
          onToggle={(v) => setMws((s) => toggle(s, v))}
          emptyHint="Nenhum middleware disponível ainda."
        />
        {mws.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {mws.map((m, i) => (
              <Badge key={m} tone="orange">
                {i + 1}. {m}
              </Badge>
            ))}
          </div>
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Prioridade" hint="Maior vence. Vazio = padrão do Traefik.">
          <Input value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="" inputMode="numeric" />
        </Field>

        <Field label="TLS">
          <label className="flex cursor-pointer items-center gap-3 rounded-control border border-white/10 bg-black/40 px-3 py-2.5 transition-colors duration-200 ease-geist hover:border-white/20">
            <Checkbox checked={tlsOn} onChange={(e) => setTlsOn(e.target.checked)} />
            <span className="text-[14px]">Habilitar TLS</span>
          </label>
          {tlsOn && (
            <Input
              value={certResolver}
              onChange={(e) => setCertResolver(e.target.value)}
              placeholder="letsencrypt"
              className="mt-2"
            />
          )}
        </Field>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Button onClick={submit} disabled={busy} className="w-full">
        {busy ? "Gravando…" : "Salvar router"}
      </Button>
    </div>
  );
}

/* =========================================================== ServiceForm */

export interface ServiceValue {
  loadBalancer?: {
    servers?: { url?: string; address?: string }[];
    passHostHeader?: boolean;
    healthCheck?: { path?: string; interval?: string };
  };
}

export function ServiceForm({
  initialName,
  initial,
  section,
  onSubmit,
  busy,
}: {
  initialName?: string;
  initial?: ServiceValue;
  section: "http" | "tcp";
  onSubmit: (name: string, value: ServiceValue) => void;
  busy: boolean;
}) {
  const isHttp = section === "http";
  const existing = (initial?.loadBalancer?.servers ?? [])
    .map((s) => s.url ?? s.address ?? "")
    .filter(Boolean);

  const [name, setName] = useState(initialName ?? "");
  const [servers, setServers] = useState(existing.length ? existing.join("\n") : "");
  const [passHost, setPassHost] = useState(initial?.loadBalancer?.passHostHeader ?? true);
  const [hcPath, setHcPath] = useState(initial?.loadBalancer?.healthCheck?.path ?? "");
  const [hcInterval, setHcInterval] = useState(initial?.loadBalancer?.healthCheck?.interval ?? "10s");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return setError("O nome é obrigatório.");
    const list = splitList(servers);
    if (list.length === 0) return setError("Informe pelo menos um servidor.");
    if (isHttp) {
      const bad = list.find((u) => !/^https?:\/\//i.test(u));
      if (bad) return setError(`"${bad}" precisa começar com http:// ou https://`);
    } else {
      const bad = list.find((a) => !/^[^\s:]+:\d+$/.test(a));
      if (bad) return setError(`"${bad}" precisa estar no formato host:porta`);
    }
    setError(null);

    const lb: NonNullable<ServiceValue["loadBalancer"]> = {
      servers: list.map((v) => (isHttp ? { url: v } : { address: v })),
    };
    if (isHttp) {
      lb.passHostHeader = passHost;
      if (hcPath.trim()) lb.healthCheck = { path: hcPath.trim(), interval: hcInterval.trim() || "10s" };
    }
    onSubmit(name.trim(), { loadBalancer: lb });
  }

  return (
    <div className="space-y-5">
      <Field label="Nome">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="meu-app" autoFocus />
      </Field>

      <Field
        label="Servidores"
        hint={isHttp ? "Uma URL por linha — http://10.0.0.10:8080" : "Um host:porta por linha — 10.0.0.10:5432"}
      >
        <Textarea
          rows={4}
          value={servers}
          onChange={(e) => setServers(e.target.value)}
          placeholder={isHttp ? "http://10.0.0.10:8080" : "10.0.0.10:5432"}
        />
      </Field>

      {isHttp && (
        <>
          <label className="flex cursor-pointer items-center gap-3 rounded-control border border-white/10 bg-black/40 px-3 py-2.5 transition-colors duration-200 ease-geist hover:border-white/20">
            <Checkbox checked={passHost} onChange={(e) => setPassHost(e.target.checked)} />
            <span className="text-[14px]">Repassar o Host header original</span>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Health check (path)" hint="Vazio desativa a checagem.">
              <Input value={hcPath} onChange={(e) => setHcPath(e.target.value)} placeholder="/health" />
            </Field>
            <Field label="Intervalo">
              <Input value={hcInterval} onChange={(e) => setHcInterval(e.target.value)} placeholder="10s" />
            </Field>
          </div>
        </>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <Button onClick={submit} disabled={busy} className="w-full">
        {busy ? "Gravando…" : "Salvar service"}
      </Button>
    </div>
  );
}

/* ======================================================== MiddlewareForm */

/** The handful of middleware types that cover most real deployments. */
const MIDDLEWARE_PRESETS: { type: string; label: string; template: string }[] = [
  { type: "headers", label: "headers", template: '{\n  "stsSeconds": 31536000,\n  "frameDeny": true\n}' },
  { type: "basicAuth", label: "basicAuth", template: '{\n  "users": ["user:$apr1$hash"]\n}' },
  { type: "rateLimit", label: "rateLimit", template: '{\n  "average": 100,\n  "burst": 50\n}' },
  { type: "compress", label: "compress", template: "{}" },
  { type: "stripPrefix", label: "stripPrefix", template: '{\n  "prefixes": ["/api"]\n}' },
  { type: "redirectScheme", label: "redirectScheme", template: '{\n  "scheme": "https",\n  "permanent": true\n}' },
  { type: "ipAllowList", label: "ipAllowList", template: '{\n  "sourceRange": ["10.0.0.0/8"]\n}' },
  { type: "retry", label: "retry", template: '{\n  "attempts": 3\n}' },
  { type: "circuitBreaker", label: "circuitBreaker", template: '{\n  "expression": "NetworkErrorRatio() > 0.5"\n}' },
];

export function MiddlewareForm({
  initialName,
  initial,
  onSubmit,
  busy,
}: {
  initialName?: string;
  initial?: Record<string, unknown>;
  onSubmit: (name: string, value: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const initialType = initial ? Object.keys(initial)[0] : "headers";
  const preset = MIDDLEWARE_PRESETS.find((p) => p.type === initialType);

  const [name, setName] = useState(initialName ?? "");
  const [type, setType] = useState(initialType ?? "headers");
  const [config, setConfig] = useState(
    initial ? JSON.stringify(initial[initialType] ?? {}, null, 2) : (preset?.template ?? "{}"),
  );
  const [error, setError] = useState<string | null>(null);

  function pickType(next: string) {
    setType(next);
    setConfig(MIDDLEWARE_PRESETS.find((p) => p.type === next)?.template ?? "{}");
  }

  function submit() {
    if (!name.trim()) return setError("O nome é obrigatório.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(config || "{}");
    } catch (err) {
      return setError(`JSON inválido: ${(err as Error).message}`);
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return setError("A configuração precisa ser um objeto JSON.");
    }
    setError(null);
    onSubmit(name.trim(), { [type]: parsed });
  }

  return (
    <div className="space-y-5">
      <Field label="Nome">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="secure-headers" autoFocus />
      </Field>

      <Field label="Tipo" hint="Trocar o tipo substitui a configuração pelo template correspondente.">
        <Select value={type} onChange={(e) => pickType(e.target.value)}>
          {MIDDLEWARE_PRESETS.map((p) => (
            <option key={p.type} value={p.type}>
              {p.label}
            </option>
          ))}
          {!MIDDLEWARE_PRESETS.some((p) => p.type === type) && <option value={type}>{type}</option>}
        </Select>
      </Field>

      <Field label="Configuração (JSON)" hint="Convertida para YAML na gravação.">
        <CodeEditor
          language="json"
          rows={12}
          value={config}
          onChange={setConfig}
          ariaLabel="Configuração do middleware em JSON"
        />
      </Field>

      {error && <Notice tone="error">{error}</Notice>}

      <Button onClick={submit} disabled={busy} className="w-full">
        {busy ? "Gravando…" : "Salvar middleware"}
      </Button>
    </div>
  );
}
