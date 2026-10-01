/*
 * Montagem do valor que os formulários gravam — pura, sem React, para dar
 * para testar contra entradas reais.
 *
 * A gravação substitui a entrada inteira e apaga as chaves ausentes (ver
 * `mergeInto` em config-store). Então todo formulário monta o valor POR CIMA
 * do que já estava no arquivo: um campo que ele não conhece
 * (`serversTransport`, `responseForwarding`, `tls.domains`…) sobrevive a um
 * abrir-e-salvar em vez de sumir.
 */

export interface RouterValue {
  rule?: string;
  entryPoints?: string[];
  service?: string;
  middlewares?: string[];
  priority?: number;
  tls?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ServiceValue {
  loadBalancer?: {
    servers?: { url?: string; address?: string; [key: string]: unknown }[];
    passHostHeader?: boolean;
    healthCheck?: { path?: string; interval?: string; [key: string]: unknown };
    serversTransport?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TransportValue {
  serverName?: string;
  insecureSkipVerify?: boolean;
  rootCAs?: string[];
  maxIdleConnsPerHost?: number;
  disableHTTP2?: boolean;
  forwardingTimeouts?: {
    dialTimeout?: string;
    responseHeaderTimeout?: string;
    idleConnTimeout?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const TRANSPORT_TIMEOUTS = ["dialTimeout", "responseHeaderTimeout", "idleConnTimeout"] as const;
export type TransportTimeout = (typeof TRANSPORT_TIMEOUTS)[number];

/** Cópia de `initial` sem as chaves que o formulário controla. */
export function withoutKeys<T extends object>(initial: T | undefined, keys: string[]): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(initial ?? {}) };
  for (const k of keys) delete rest[k];
  return rest;
}

export function buildRouterValue(
  initial: RouterValue | undefined,
  f: {
    rule: string;
    service: string;
    entryPoints: string[];
    middlewares: string[];
    priority: string;
    tlsOn: boolean;
    certResolver: string;
  },
): RouterValue {
  const value: RouterValue = {
    ...withoutKeys(initial, ["rule", "service", "entryPoints", "middlewares", "priority", "tls"]),
    rule: f.rule.trim(),
    service: f.service.trim(),
  };
  if (f.entryPoints.length) value.entryPoints = f.entryPoints;
  if (f.middlewares.length) value.middlewares = f.middlewares;
  if (f.priority) value.priority = Number(f.priority);
  if (f.tlsOn) {
    /* `domains`, `options` e afins do TLS existente continuam. */
    const tls = withoutKeys(initial?.tls, ["certResolver"]);
    if (f.certResolver.trim()) tls.certResolver = f.certResolver.trim();
    value.tls = tls;
  }
  return value;
}

export function buildServiceValue(
  initial: ServiceValue | undefined,
  f: {
    isHttp: boolean;
    servers: string[];
    passHostHeader: boolean;
    hcPath: string;
    hcInterval: string;
    serversTransport: string;
  },
): ServiceValue {
  const lbBefore = initial?.loadBalancer;
  /* Servidor que continua na lista mantém o que tinha além do endereço
     (`weight`, `preservePath`…). */
  const before = lbBefore?.servers ?? [];
  const lb: NonNullable<ServiceValue["loadBalancer"]> = {
    ...withoutKeys(lbBefore, ["servers", "passHostHeader", "healthCheck", "serversTransport"]),
    servers: f.servers.map((v) => {
      const prev = before.find((s) => (f.isHttp ? s.url : s.address) === v);
      return prev ? { ...prev } : f.isHttp ? { url: v } : { address: v };
    }),
  };
  if (f.isHttp) {
    /* Ausente no arquivo e marcado (o padrão do Traefik): não escreve, para
       abrir e salvar não acrescentar linha nenhuma. */
    if (lbBefore?.passHostHeader !== undefined || !f.passHostHeader) lb.passHostHeader = f.passHostHeader;
    if (f.hcPath.trim()) {
      lb.healthCheck = {
        ...withoutKeys(lbBefore?.healthCheck, ["path", "interval"]),
        path: f.hcPath.trim(),
        interval: f.hcInterval.trim() || "10s",
      };
    }
  }
  if (f.serversTransport.trim()) lb.serversTransport = f.serversTransport.trim();
  return { ...withoutKeys(initial, ["loadBalancer"]), loadBalancer: lb };
}

/**
 * Campos vazios saem do arquivo — exceto os que já estavam lá: o padrão
 * comum `serverName: ""` (escrito para "não force SNI") continua escrito,
 * e um `false` que existia não some. `certificates`, `peerCertURI`, `spiffe`
 * e o que mais o formulário não mostra ficam como estavam.
 */
export function buildTransportValue(
  initial: TransportValue | undefined,
  f: {
    serverName: string;
    insecureSkipVerify: boolean;
    rootCAs: string[];
    maxIdleConnsPerHost: string;
    disableHTTP2: boolean;
    timeouts: Record<TransportTimeout, string>;
  },
): TransportValue {
  const had = (k: string) => initial != null && Object.hasOwn(initial, k);
  const value: TransportValue = withoutKeys(initial, [
    "serverName",
    "insecureSkipVerify",
    "rootCAs",
    "maxIdleConnsPerHost",
    "disableHTTP2",
    "forwardingTimeouts",
  ]);

  if (f.serverName.trim() || had("serverName")) value.serverName = f.serverName.trim();
  if (f.insecureSkipVerify || had("insecureSkipVerify")) value.insecureSkipVerify = f.insecureSkipVerify;
  if (f.rootCAs.length) value.rootCAs = f.rootCAs;
  if (f.maxIdleConnsPerHost.trim()) value.maxIdleConnsPerHost = Number(f.maxIdleConnsPerHost);
  if (f.disableHTTP2 || had("disableHTTP2")) value.disableHTTP2 = f.disableHTTP2;

  const timeouts: NonNullable<TransportValue["forwardingTimeouts"]> = withoutKeys(
    initial?.forwardingTimeouts,
    [...TRANSPORT_TIMEOUTS],
  );
  for (const k of TRANSPORT_TIMEOUTS) if (f.timeouts[k].trim()) timeouts[k] = f.timeouts[k].trim();
  if (Object.keys(timeouts).length) value.forwardingTimeouts = timeouts;
  return value;
}
