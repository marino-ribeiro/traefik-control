"use client";

import { useEffect, useState } from "react";
import type { DashboardData } from "@/lib/metrics";
import { StatTile } from "@/components/ui/StatTile";
import { Mono, Notice, cx } from "@/components/ui/primitives";
import { Activity, ArrowDownCircle, ArrowUpCircle, Gauge, ShieldCheck, Signal } from "@/components/ui/icons";
import { StackedAreaChart } from "@/components/charts/StackedAreaChart";
import { LatencyChart } from "@/components/charts/LatencyChart";
import { TrafficChart } from "@/components/charts/TrafficChart";
import { TopRouters } from "@/components/charts/TopRouters";
import { Sparkline } from "@/components/charts/Sparkline";
import { formatBytes, formatDuration, formatPercent, formatRps } from "@/components/charts/format";
import { LATENCY_SERIES, TRAFFIC_SERIES } from "@/components/charts/palette";

const POLL_MS = 5_000;

export function MetricsView({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState(initial);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as DashboardData;
        if (!cancelled) setData(next);
      } catch {
        /* Uma falha de rede pontual não deve derrubar a tela; o próximo
           tick tenta de novo. */
      }
    }

    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live]);

  const { totals } = data;
  const rpsSeries = data.requests.map((p) => p.c2xx + p.c3xx + p.c4xx + p.c5xx);
  const errSeries = data.requests.map((p) => p.c4xx + p.c5xx);

  return (
    <>
      {data.mock && (
        <div className="mb-6">
          <Notice tone="warn">
            <strong className="font-bold">Série sintética.</strong> Estes números são gerados para você avaliar
            a interface. Ligue <Mono>metrics.prometheus</Mono> no Traefik e aponte{" "}
            <Mono>TRAEFIK_METRICS_URL</Mono> para ver dados reais.
          </Notice>
        </div>
      )}

      {!data.mock && data.error && (
        <div className="mb-6">
          <Notice tone="error">
            <strong className="font-bold">Não consegui raspar {data.metricsUrl || "(sem URL)"}.</strong>
            <br />
            {data.error}
            <br />
            <span className="mt-1 block">
              O Traefik precisa subir com <Mono>metrics.prometheus.addEntryPointsLabels</Mono> e{" "}
              <Mono>addRoutersLabels: true</Mono> — sem o rótulo de router, o gráfico de volume por router fica
              vazio.
            </span>
          </Notice>
        </div>
      )}

      {!data.mock && !data.error && data.samples < 2 && (
        <div className="mb-6">
          <Notice tone="info">
            Coletando amostras ({data.samples}/2). As métricas do Traefik são contadores acumulados — a primeira
            taxa aparece na segunda leitura, daqui a ~{data.intervalSeconds}s.
          </Notice>
        </div>
      )}

      <section className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        <StatTile
          label="Requisições"
          value={`${formatRps(totals.rps)}/s`}
          Icon={Activity}
          detail="média da última janela"
          spark={<Sparkline values={rpsSeries.slice(-40)} color="#3987e5" label="Tendência de requisições por segundo" />}
        />
        <StatTile
          label="Latência p95"
          value={formatDuration(totals.p95)}
          Icon={Gauge}
          tone={totals.p95 != null && totals.p95 > 1 ? "warn" : "neutral"}
          detail={`p50 ${formatDuration(totals.p50)} · p99 ${formatDuration(totals.p99)}`}
          spark={
            <Sparkline
              values={data.latency.map((p) => p.p95 ?? 0).slice(-40)}
              color={LATENCY_SERIES[1].color}
              label="Tendência da latência p95"
            />
          }
        />
        <StatTile
          label="Taxa de erro"
          value={formatPercent(totals.errorRate)}
          Icon={ShieldCheck}
          tone={totals.errorRate > 0.05 ? "red" : totals.errorRate > 0.01 ? "warn" : "ok"}
          detail="respostas 4xx e 5xx"
          spark={<Sparkline values={errSeries.slice(-40)} color="#d03b3b" label="Tendência de respostas com erro" />}
        />
        <StatTile
          label="Conexões abertas"
          value={totals.openConnections}
          Icon={Signal}
          detail={`${totals.reloads} recargas de config${totals.reloadFailures > 0 ? ` · ${totals.reloadFailures} falharam` : ""}`}
        />
      </section>

      <section className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
        <StatTile
          label="Entrada"
          value={formatBytes(totals.inBps, "/s")}
          Icon={ArrowDownCircle}
          spark={
            <Sparkline
              values={data.traffic.map((p) => p.inBps).slice(-40)}
              color={TRAFFIC_SERIES[0].color}
              label="Tendência do tráfego de entrada"
            />
          }
        />
        <StatTile
          label="Saída"
          value={formatBytes(totals.outBps, "/s")}
          Icon={ArrowUpCircle}
          spark={
            <Sparkline
              values={data.traffic.map((p) => p.outBps).slice(-40)}
              color={TRAFFIC_SERIES[1].color}
              label="Tendência do tráfego de saída"
            />
          }
        />
        <div className="glass-tile rounded-tile flex flex-col justify-between px-6 py-6">
          <span className="label-caps block">Coleta</span>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            <span className="metric block text-[28px] leading-none text-fg">{data.samples}</span>
            amostras em memória, a cada {data.intervalSeconds}s
          </p>
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            aria-pressed={live}
            className={cx(
              "mt-4 self-start rounded-control border px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 ease-geist",
              live ? "border-ok/40 text-ok" : "border-white/12 text-muted hover:text-fg",
            )}
          >
            {live ? "ao vivo" : "pausado"}
          </button>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-2">
        <StackedAreaChart points={data.requests} />
        <LatencyChart points={data.latency} />
        <TrafficChart points={data.traffic} />
        <TopRouters routers={data.topRouters} />
      </div>
    </>
  );
}
