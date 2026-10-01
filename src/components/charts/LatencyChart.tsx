"use client";

import type { LatencyPoint } from "@/lib/metrics";
import { LATENCY_SERIES } from "./palette";
import { formatClock, formatClockSeconds, formatDuration, niceCeil } from "./format";
import {
  ChartFrame,
  EmptyPlot,
  GridLines,
  Tooltip,
  TooltipRow,
  XAxisLabels,
  YAxisLabels,
  useChartWidth,
  useHover,
} from "./chart-kit";

const HEIGHT = 210;
const PAD = { top: 14, right: 14, bottom: 22, left: 52 };

/** Percentis de latência — rampa ordinal de um matiz só. */
export function LatencyChart({ points }: { points: LatencyPoint[] }) {
  const [ref, width] = useChartWidth();
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const [hover, onMove, onLeave] = useHover(points.length, PAD.left, plotW);

  const all = points.flatMap((p) => [p.p50, p.p95, p.p99]).filter((v): v is number => v != null);
  const yMax = niceCeil(Math.max(...all, 0.001));
  const scaleY = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const scaleX = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW);
  const ticks = [0, yMax / 2, yMax];

  const enough = points.length >= 2 && width > 0 && all.length > 0;

  return (
    <ChartFrame
      title="Latência"
      subtitle="Percentis calculados sobre os buckets do histograma, por janela."
      series={LATENCY_SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
      table={<LatencyTable points={points} />}
    >
      <div ref={ref} className="relative">
        {!enough ? (
          <EmptyPlot height={HEIGHT} message="Sem amostras de latência suficientes ainda." />
        ) : (
          <svg width={width} height={HEIGHT} role="img" aria-label="Percentis de latência ao longo do tempo">
            <GridLines ticks={ticks} x0={PAD.left} x1={PAD.left + plotW} scaleY={scaleY} />
            <YAxisLabels ticks={ticks} x={6} scaleY={scaleY} format={(v) => formatDuration(v)} />

            {LATENCY_SERIES.map((s) => {
              /* Segmenta em trechos contínuos: um buraco (null) vira quebra,
                 e não uma reta atravessando o vazio. */
              const runs: string[] = [];
              let current: string[] = [];
              points.forEach((p, i) => {
                const v = p[s.key];
                if (v == null) {
                  if (current.length > 1) runs.push(current.join(" "));
                  current = [];
                  return;
                }
                current.push(`${current.length === 0 ? "M" : "L"}${scaleX(i)},${scaleY(v)}`);
              });
              if (current.length > 1) runs.push(current.join(" "));

              return runs.map((d, k) => (
                <path
                  key={`${s.key}-${k}`}
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ));
            })}

            <XAxisLabels points={points.map((p) => p.t)} scaleX={scaleX} y={HEIGHT - 6} format={formatClock} />

            {hover && (
              <>
                <line
                  x1={hover.x}
                  x2={hover.x}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth={1}
                />
                {LATENCY_SERIES.map((s) => {
                  const v = points[hover.index][s.key];
                  return v == null ? null : (
                    <circle key={s.key} cx={hover.x} cy={scaleY(v)} r={4} fill={s.color} />
                  );
                })}
              </>
            )}

            <rect
              x={PAD.left}
              y={PAD.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={onLeave}
            />
          </svg>
        )}

        {enough && hover && (
          <Tooltip x={hover.x} width={width}>
            <p className="mb-1.5 text-[11px] tracking-[0.08em] text-muted">
              {formatClockSeconds(points[hover.index].t)}
            </p>
            {LATENCY_SERIES.map((s) => (
              <TooltipRow
                key={s.key}
                color={s.color}
                label={s.label}
                value={formatDuration(points[hover.index][s.key])}
              />
            ))}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

function LatencyTable({ points }: { points: LatencyPoint[] }) {
  const rows = points.slice(-40).reverse();
  return (
    <table className="w-full border-collapse text-left text-[12.5px]">
      <caption className="sr-only">Percentis de latência por instante</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="label-caps py-2 pr-4 font-medium">Hora</th>
          {LATENCY_SERIES.map((s) => (
            <th key={s.key} scope="col" className="label-caps py-2 pr-4 text-right font-medium">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.t} className="border-b border-line/50">
            <th scope="row" className="py-1.5 pr-4 font-mono text-[12px] font-normal text-muted">
              {formatClockSeconds(p.t)}
            </th>
            {LATENCY_SERIES.map((s) => (
              <td key={s.key} className="metric py-1.5 pr-4 text-right font-mono">
                {formatDuration(p[s.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
