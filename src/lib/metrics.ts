import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { bucketsOf, parsePrometheus, quantileFromBuckets, sumOf } from "./prometheus";
import { mockDashboard } from "./metrics-mock";

/**
 * As métricas do Traefik são CONTADORES monotônicos: uma raspagem só te diz
 * o acumulado desde o boot. Para ter taxa (req/s) e série temporal alguém
 * precisa guardar amostras e derivar. Este módulo é esse alguém.
 *
 * Consequência honesta: o histórico começa vazio e se preenche enquanto o
 * painel roda. Não existe retroativo — para isso é preciso um Prometheus de
 * verdade guardando os dados. Com METRICS_HISTORY_FILE, o anel vai para o
 * disco a cada PERSIST_EVERY amostras e volta no boot: reiniciar o painel
 * (deploy, restart) não zera mais os últimos 30 min.
 */

const SAMPLE_INTERVAL_MS = 5_000;
const RING_SIZE = 360; // 30 min a 5s
const PERSIST_EVERY = 6; // grava a cada 30s: no pior caso, um restart perde isso
const GAP_SECONDS = (3 * SAMPLE_INTERVAL_MS) / 1000;

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
  /** Amostras desde a última gravação em disco. */
  sinceSave: number;
  saving: boolean;
}

/* Sobrevive ao hot-reload do dev, que reavalia o módulo a cada edição. */
const globalRef = globalThis as unknown as { __traefikSampler?: SamplerState };
const state: SamplerState = (globalRef.__traefikSampler ??= {
  ring: [],
  timer: null,
  lastError: null,
  started: false,
  sinceSave: 0,
  saving: false,
});

/* -------------------------------------------------------- histórico */

function historyFile(): string | null {
  const f = process.env.METRICS_HISTORY_FILE?.trim();
  return f ? path.resolve(f) : null;
}

const HISTORY_VERSION = 1;

/* JSON não tem Infinity, e o bucket `le="+Inf"` é chave de todo histograma. */
type Buckets = [number | "+Inf", number][];
const encodeBuckets = (m: Map<number, number>): Buckets =>
  [...m].map(([le, v]) => [le === Number.POSITIVE_INFINITY ? "+Inf" : le, v]);
const decodeBuckets = (b: Buckets): Map<number, number> =>
  new Map(b.map(([le, v]) => [le === "+Inf" ? Number.POSITIVE_INFINITY : le, v]));

interface StoredSnapshot extends Omit<Snapshot, "buckets" | "routers" | "routerBuckets"> {
  buckets: Buckets;
  routers: [string, { total: number; errors: number }][];
  routerBuckets: [string, Buckets][];
}

function encode(s: Snapshot): StoredSnapshot {
  return {
    ...s,
    buckets: encodeBuckets(s.buckets),
    routers: [...s.routers],
    routerBuckets: [...s.routerBuckets].map(([r, b]) => [r, encodeBuckets(b)]),
  };
}

function decode(s: StoredSnapshot): Snapshot {
  return {
    ...s,
    buckets: decodeBuckets(s.buckets),
    routers: new Map(s.routers),
    routerBuckets: new Map(s.routerBuckets.map(([r, b]) => [r, decodeBuckets(b)])),
  };
}

/**
 * Recarrega o anel gravado. Só o que ainda caberia na janela de 30 min
 * volta; arquivo ausente, corrompido ou de outra versão é ignorado — o
 * histórico é conveniência, nunca motivo para o painel não subir.
 */
async function loadHistory(): Promise<void> {
  const file = historyFile();
  if (!file) return;
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8")) as { version?: number; ring?: StoredSnapshot[] };
    if (data.version !== HISTORY_VERSION || !Array.isArray(data.ring)) return;
    const oldest = Date.now() - RING_SIZE * SAMPLE_INTERVAL_MS;
    const restored = data.ring.filter((s) => typeof s?.t === "number" && s.t >= oldest).map(decode);
    /* Amostras que o timer já colheu antes da leitura terminar vêm depois. */
    state.ring = [...restored, ...state.ring.filter((s) => s.t > (restored.at(-1)?.t ?? 0))].slice(-RING_SIZE);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[metrics] histórico ignorado (${file}): ${(err as Error).message}`);
    }
  }
}

/** Temp + rename, como o dynamic.yml: um boot nunca lê arquivo pela metade. */
async function saveHistory(): Promise<void> {
  const file = historyFile();
  if (!file || state.saving) return;
  state.saving = true;
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify({ version: HISTORY_VERSION, ring: state.ring.map(encode) }), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    console.warn(`[metrics] não consegui gravar o histórico em ${file}: ${(err as Error).message}`);
  } finally {
    state.saving = false;
  }
}

export function metricsUrl(): string {
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
    state.sinceSave += 1;
    if (state.sinceSave >= PERSIST_EVERY) {
      state.sinceSave = 0;
      void saveHistory();
    }
  } catch (err) {
    state.lastError = (err as Error).message;
  }
}

/** Idempotente: a primeira leitura liga o timer, as seguintes só usam o anel. */
export function ensureSampler(): void {
  if (state.started || isMock()) return;
  state.started = true;
  /* Primeiro o histórico, depois a primeira raspagem: assim ela entra no
     fim do anel recarregado, e a taxa sai do par certo. */
  void loadHistory().then(() => scrape());
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
    /* Buraco maior que três raspagens = painel fora do ar (restart, deploy)
       entre as duas amostras. A diferença dos contadores é real, mas
       dividida pelo buraco vira uma média que nunca existiu: melhor não
       desenhar ponto nenhum ali. */
    if (dt <= 0 || dt > GAP_SECONDS) continue;

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
     tremerem a cada poll de 5s — só sobre amostras contínuas: logo depois
     de um restart do painel, a janela não atravessa o buraco. */
  const last = state.ring[state.ring.length - 1];
  let baselineIdx = state.ring.length - 1;
  while (
    baselineIdx > Math.max(0, state.ring.length - 13) &&
    (state.ring[baselineIdx].t - state.ring[baselineIdx - 1].t) / 1000 <= GAP_SECONDS
  ) {
    baselineIdx -= 1;
  }
  /* Uma amostra só depois do buraco: baseline = last, deltas zero, por uns 5s. */
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
