import type { DashboardData, LatencyPoint, RouterVolume, StatusPoint, TrafficPoint } from "./metrics";

/**
 * Série sintética para o modo demonstração.
 *
 * É determinística por janela de 5s (o mesmo instante gera sempre os mesmos
 * números), o que evita divergência de hidratação entre o render do servidor
 * e o do cliente — e ainda assim anima, porque a janela avança com o relógio.
 */

const INTERVAL_MS = 5_000;
const POINTS = 180; // 15 min

/** PRNG determinístico (mulberry32) — mesma semente, mesma sequência. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Onda diária suave + ruído, para o tráfego não parecer uma reta. */
function shape(i: number, rand: () => number): number {
  const wave = 0.65 + 0.35 * Math.sin((i / POINTS) * Math.PI * 2);
  const ripple = 0.9 + 0.2 * Math.sin(i / 7);
  return wave * ripple * (0.88 + rand() * 0.24);
}

const ROUTERS = [
  { name: "grafana@docker", weight: 1.0, err: 0.004, p95: 0.082 },
  { name: "glpi@docker", weight: 0.72, err: 0.011, p95: 0.145 },
  { name: "gitea@file", weight: 0.54, err: 0.003, p95: 0.061 },
  { name: "zabbix@file", weight: 0.41, err: 0.026, p95: 0.238 },
  { name: "dashboard@docker", weight: 0.22, err: 0.001, p95: 0.019 },
  { name: "broken-api@docker", weight: 0.14, err: 0.62, p95: 1.84 },
];

export function mockDashboard(): DashboardData {
  const now = Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS;

  const requests: StatusPoint[] = [];
  const latency: LatencyPoint[] = [];
  const traffic: TrafficPoint[] = [];

  for (let i = 0; i < POINTS; i += 1) {
    const t = now - (POINTS - 1 - i) * INTERVAL_MS;
    const rand = rng(Math.floor(t / INTERVAL_MS));
    const load = shape(i, rand);
    const total = 42 * load;

    // Um pico de erro por volta de 2/3 da janela, para o gráfico ter história.
    const incident = i > POINTS * 0.62 && i < POINTS * 0.72 ? 1 : 0;

    const c5xx = total * (0.004 + incident * 0.09) * (0.6 + rand() * 0.8);
    const c4xx = total * (0.021 + incident * 0.02) * (0.6 + rand() * 0.8);
    const c3xx = total * 0.06 * (0.7 + rand() * 0.6);
    const c2xx = Math.max(0, total - c5xx - c4xx - c3xx);
    requests.push({ t, c2xx, c3xx, c4xx, c5xx });

    const base = 0.045 * (1 + incident * 2.4) * (0.85 + rand() * 0.3);
    latency.push({ t, p50: base, p95: base * 2.9, p99: base * 5.4 });

    traffic.push({
      t,
      inBps: 78_000 * load * (0.85 + rand() * 0.3),
      outBps: 640_000 * load * (0.85 + rand() * 0.3),
    });
  }

  const last = requests[requests.length - 1];
  const lastTotal = last.c2xx + last.c3xx + last.c4xx + last.c5xx;
  const lastLatency = latency[latency.length - 1];
  const lastTraffic = traffic[traffic.length - 1];

  const rand = rng(Math.floor(now / INTERVAL_MS) + 7);
  const scale = lastTotal / ROUTERS.reduce((n, r) => n + r.weight, 0);
  const topRouters: RouterVolume[] = ROUTERS.map((r) => ({
    router: r.name,
    rps: r.weight * scale * (0.92 + rand() * 0.16),
    errorRate: r.err,
    p95: r.p95,
    share: 0,
  })).sort((a, b) => b.rps - a.rps);
  const maxRps = topRouters[0]?.rps ?? 0;
  for (const r of topRouters) r.share = maxRps > 0 ? r.rps / maxRps : 0;

  return {
    available: true,
    mock: true,
    error: null,
    metricsUrl: "mock://metrics",
    samples: POINTS,
    intervalSeconds: INTERVAL_MS / 1000,
    requests,
    latency,
    traffic,
    topRouters,
    totals: {
      rps: lastTotal,
      errorRate: lastTotal > 0 ? (last.c4xx + last.c5xx) / lastTotal : 0,
      p50: lastLatency.p50,
      p95: lastLatency.p95,
      p99: lastLatency.p99,
      openConnections: Math.round(24 + rand() * 40),
      inBps: lastTraffic.inBps,
      outBps: lastTraffic.outBps,
      reloads: 37,
      reloadFailures: 0,
    },
  };
}
