import "server-only";
import { bucketsOf, parsePrometheus, quantileFromBuckets, sumOf } from "./prometheus";
import { mockDashboard } from "./metrics-mock";

/**
 * As métricas do Traefik são CONTADORES monotônicos: uma raspagem só te diz
 * o acumulado desde o boot. Para ter taxa (req/s) e série temporal alguém
 * precisa guardar amostras e derivar. Este módulo é esse alguém.
 *
 * Consequência honesta: o histórico começa vazio e se preenche enquanto o
 * painel roda. Não existe retroativo — para isso é preciso um Prometheus de
 * verdade guardando os dados.
 */

const SAMPLE_INTERVAL_MS = 5_000;
const RING_SIZE = 360; // 30 min a 5s

export interface StatusPoint {
  t: number;
  c2xx: number;
  c3xx: number;
  c4xx: number;
  c5xx: number;
}

export interface LatencyPoint {
  t: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface TrafficPoint {
  t: number;
  inBps: number;
  outBps: number;
}

export interface RouterVolume {
  router: string;
  rps: number;
  errorRate: number;
  p95: number | null;
  share: number;
}

export interface DashboardData {
  available: boolean;
  mock: boolean;
  error: string | null;
  metricsUrl: string;
  /** Amostras já coletadas — a UI usa isto para explicar gráficos vazios. */
  samples: number;
  intervalSeconds: number;
  requests: StatusPoint[];
  latency: LatencyPoint[];
  traffic: TrafficPoint[];
  topRouters: RouterVolume[];
  totals: {
    rps: number;
    errorRate: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    openConnections: number;
    inBps: number;
    outBps: number;
    reloads: number;
    reloadFailures: number;
  };
}

interface Snapshot {
  t: number;
  status: { c2xx: number; c3xx: number; c4xx: number; c5xx: number };
  buckets: Map<number, number>;
  bytesIn: number;
  bytesOut: number;
  routers: Map<string, { total: number; errors: number }>;
  routerBuckets: Map<string, Map<number, number>>;
  openConnections: number;
  reloads: number;
  reloadFailures: number;
}

interface SamplerState {
  ring: Snapshot[];
  timer: NodeJS.Timeout | null;
  lastError: string | null;
  started: boolean;
}

/* Sobrevive ao hot-reload do dev, que reavalia o módulo a cada edição. */
const globalRef = globalThis as unknown as { __traefikSampler?: SamplerState };
const state: SamplerState = (globalRef.__traefikSampler ??= {
  ring: [],
  timer: null,
  lastError: null,
  started: false,
});

function metricsUrl(): string {
  const explicit = process.env.TRAEFIK_METRICS_URL;
  if (explicit) return explicit;
  const base = (process.env.TRAEFIK_API_URL ?? "").replace(/\/+$/, "");
  return base ? `${base}/metrics` : "";
}

function isMock(): boolean {
  return process.env.TRAEFIK_MOCK === "1" || metricsUrl() === "";
}

function authHeader(): Record<string, string> {
  const user = process.env.TRAEFIK_API_USER;
  const pass = process.env.TRAEFIK_API_PASSWORD;
  if (!user || !pass) return {};
  return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
}

/** Classe do status HTTP a partir do label `code`. */
function classOf(code: string): "c2xx" | "c3xx" | "c4xx" | "c5xx" | null {
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  if (n >= 200 && n < 300) return "c2xx";
  if (n >= 300 && n < 400) return "c3xx";
  if (n >= 400 && n < 500) return "c4xx";
  if (n >= 500 && n < 600) return "c5xx";
  return null;
}

async function scrape(): Promise<void> {
  const url = metricsUrl();
  if (!url) return;

  try {
    const res = await fetch(url, {
      headers: { Accept: "text/plain", ...authHeader() },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`endpoint respondeu ${res.status}`);
    const index = parsePrometheus(await res.text());

    const status = { c2xx: 0, c3xx: 0, c4xx: 0, c5xx: 0 };
    for (const m of index.get("traefik_service_requests_total") ?? []) {
      const cls = classOf(m.labels.code ?? "");
      if (cls && Number.isFinite(m.value)) status[cls] += m.value;
    }

    const routers = new Map<string, { total: number; errors: number }>();
    for (const m of index.get("traefik_router_requests_total") ?? []) {
      const name = m.labels.router;
      if (!name || !Number.isFinite(m.value)) continue;
      const entry = routers.get(name) ?? { total: 0, errors: 0 };
      entry.total += m.value;
      const cls = classOf(m.labels.code ?? "");
      if (cls === "c5xx" || cls === "c4xx") entry.errors += m.value;
      routers.set(name, entry);
    }

    const routerBuckets = new Map<string, Map<number, number>>();
    for (const m of index.get("traefik_router_request_duration_seconds_bucket") ?? []) {
      const name = m.labels.router;
      if (!name) continue;
      const le = m.labels.le === "+Inf" ? Number.POSITIVE_INFINITY : Number(m.labels.le);
      if (Number.isNaN(le) || !Number.isFinite(m.value)) continue;
      const inner = routerBuckets.get(name) ?? new Map<number, number>();
      inner.set(le, (inner.get(le) ?? 0) + m.value);
      routerBuckets.set(name, inner);
    }

    const snapshot: Snapshot = {
      t: Date.now(),
      status,
      buckets: bucketsOf(index, "traefik_service_request_duration_seconds_bucket"),
      bytesIn: sumOf(index, "traefik_service_requests_bytes_total"),
      bytesOut: sumOf(index, "traefik_service_responses_bytes_total"),
      routers,
      routerBuckets,
      openConnections: sumOf(index, "traefik_open_connections"),
      reloads: sumOf(index, "traefik_config_reloads_total"),
      reloadFailures: sumOf(index, "traefik_config_reloads_failure_total"),
    };

    state.ring.push(snapshot);
    if (state.ring.length > RING_SIZE) state.ring.splice(0, state.ring.length - RING_SIZE);
    state.lastError = null;
  } catch (err) {
    state.lastError = (err as Error).message;
  }
}

/** Idempotente: a primeira leitura liga o timer, as seguintes só usam o anel. */
export function ensureSampler(): void {
  if (state.started || isMock()) return;
  state.started = true;
  void scrape();
  state.timer = setInterval(() => void scrape(), SAMPLE_INTERVAL_MS);
  state.timer.unref?.();
}

/** Delta de contador com guarda de reset (Traefik reiniciado zera tudo). */
function delta(curr: number, prev: number): number {
  return curr >= prev ? curr - prev : curr;
}

function ratePerSecond(curr: number, prev: number, dtSeconds: number): number {
  if (dtSeconds <= 0) return 0;
  return delta(curr, prev) / dtSeconds;
}

/** Diferença entre dois conjuntos de buckets, para o histograma da janela. */
function bucketDelta(curr: Map<number, number>, prev: Map<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const [le, value] of curr) out.set(le, delta(value, prev.get(le) ?? 0));
  return out;
}

export function getDashboard(): DashboardData {
  if (isMock()) return mockDashboard();

  ensureSampler();

  const url = metricsUrl();
  const empty: DashboardData = {
    available: state.ring.length > 0,
    mock: false,
    error: state.lastError,
    metricsUrl: url,
    samples: state.ring.length,
    intervalSeconds: SAMPLE_INTERVAL_MS / 1000,
    requests: [],
    latency: [],
    traffic: [],
    topRouters: [],
    totals: {
      rps: 0,
      errorRate: 0,
      p50: null,
      p95: null,
      p99: null,
      openConnections: state.ring.at(-1)?.openConnections ?? 0,
      inBps: 0,
      outBps: 0,
      reloads: state.ring.at(-1)?.reloads ?? 0,
      reloadFailures: state.ring.at(-1)?.reloadFailures ?? 0,
    },
  };

  /* Uma amostra só dá acumulado; taxa exige duas. */
  if (state.ring.length < 2) return empty;

  const requests: StatusPoint[] = [];
  const latency: LatencyPoint[] = [];
  const traffic: TrafficPoint[] = [];

  for (let i = 1; i < state.ring.length; i += 1) {
    const prev = state.ring[i - 1];
    const curr = state.ring[i];
    const dt = (curr.t - prev.t) / 1000;
    if (dt <= 0) continue;

    requests.push({
      t: curr.t,
      c2xx: ratePerSecond(curr.status.c2xx, prev.status.c2xx, dt),
      c3xx: ratePerSecond(curr.status.c3xx, prev.status.c3xx, dt),
      c4xx: ratePerSecond(curr.status.c4xx, prev.status.c4xx, dt),
      c5xx: ratePerSecond(curr.status.c5xx, prev.status.c5xx, dt),
    });

    const window = bucketDelta(curr.buckets, prev.buckets);
    latency.push({
      t: curr.t,
      p50: quantileFromBuckets(window, 0.5),
      p95: quantileFromBuckets(window, 0.95),
      p99: quantileFromBuckets(window, 0.99),
    });

    traffic.push({
      t: curr.t,
      inBps: ratePerSecond(curr.bytesIn, prev.bytesIn, dt),
      outBps: ratePerSecond(curr.bytesOut, prev.bytesOut, dt),
    });
  }

  /* Os totais do topo usam uma janela mais longa (até 1 min) para não
     tremerem a cada poll de 5s. */
  const last = state.ring[state.ring.length - 1];
  const baselineIdx = Math.max(0, state.ring.length - 13);
  const baseline = state.ring[baselineIdx];
  const spanSeconds = (last.t - baseline.t) / 1000 || 1;

  const totalReq =
    delta(last.status.c2xx, baseline.status.c2xx) +
    delta(last.status.c3xx, baseline.status.c3xx) +
    delta(last.status.c4xx, baseline.status.c4xx) +
    delta(last.status.c5xx, baseline.status.c5xx);
  const errorReq =
    delta(last.status.c4xx, baseline.status.c4xx) + delta(last.status.c5xx, baseline.status.c5xx);

  const windowBuckets = bucketDelta(last.buckets, baseline.buckets);

  const topRouters: RouterVolume[] = [];
  for (const [name, curr] of last.routers) {
    const prev = baseline.routers.get(name) ?? { total: 0, errors: 0 };
    const reqs = delta(curr.total, prev.total);
    const errs = delta(curr.errors, prev.errors);
    const currB = last.routerBuckets.get(name);
    const prevB = baseline.routerBuckets.get(name) ?? new Map<number, number>();
    topRouters.push({
      router: name,
      rps: reqs / spanSeconds,
      errorRate: reqs > 0 ? errs / reqs : 0,
      p95: currB ? quantileFromBuckets(bucketDelta(currB, prevB), 0.95) : null,
      share: 0,
    });
  }
  topRouters.sort((a, b) => b.rps - a.rps);
  const top = topRouters.slice(0, 8);
  const maxRps = top[0]?.rps ?? 0;
  for (const r of top) r.share = maxRps > 0 ? r.rps / maxRps : 0;

  return {
    available: true,
    mock: false,
    error: state.lastError,
    metricsUrl: url,
    samples: state.ring.length,
    intervalSeconds: SAMPLE_INTERVAL_MS / 1000,
    requests,
    latency,
    traffic,
    topRouters: top,
    totals: {
      rps: totalReq / spanSeconds,
      errorRate: totalReq > 0 ? errorReq / totalReq : 0,
      p50: quantileFromBuckets(windowBuckets, 0.5),
      p95: quantileFromBuckets(windowBuckets, 0.95),
      p99: quantileFromBuckets(windowBuckets, 0.99),
      openConnections: last.openConnections,
      inBps: delta(last.bytesIn, baseline.bytesIn) / spanSeconds,
      outBps: delta(last.bytesOut, baseline.bytesOut) / spanSeconds,
      reloads: last.reloads,
      reloadFailures: last.reloadFailures,
    },
  };
}
