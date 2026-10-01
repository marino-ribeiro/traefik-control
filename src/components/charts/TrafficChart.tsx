"use client";

import type { TrafficPoint } from "@/lib/metrics";
import { TRAFFIC_SERIES } from "./palette";
import { formatBytes, formatClock, formatClockSeconds, niceCeil } from "./format";
import {
  ChartFrame,
  EmptyPlot,
  Tooltip,
  TooltipRow,
  XAxisLabels,
  useChartWidth,
  useHover,
} from "./chart-kit";
import { GRID_COLOR, AXIS_TEXT } from "./palette";

const HEIGHT = 210;
const PAD = { top: 14, right: 14, bottom: 22, left: 58 };

/**
 * Entrada e saída espelhadas em torno de um eixo central.
 *
 * O espelho é LAYOUT, não polaridade: as duas séries são identidades
 * distintas (dois slots categóricos), e ambas crescem a partir de zero. Um
 * eixo só, escala compartilhada — nada de dois eixos y.
 */
export function TrafficChart({ points }: { points: TrafficPoint[] }) {
  const [ref, width] = useChartWidth();
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const mid = PAD.top + plotH / 2;
  const half = plotH / 2;
  const [hover, onMove, onLeave] = useHover(points.length, PAD.left, plotW);

  const yMax = niceCeil(Math.max(...points.flatMap((p) => [p.inBps, p.outBps]), 1));
  const scaleX = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW);
  const up = (v: number) => mid - (v / yMax) * half;
  const down = (v: number) => mid + (v / yMax) * half;

  const enough = points.length >= 2 && width > 0;

  const band = (accessor: (p: TrafficPoint) => number, project: (v: number) => number) => {
    const edge = points.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${project(accessor(p))}`).join(" ");
    const area = `${edge} L${scaleX(points.length - 1)},${mid} L${scaleX(0)},${mid} Z`;
    return { edge, area };
  };

  const inBand = enough ? band((p) => p.inBps, up) : null;
  const outBand = enough ? band((p) => p.outBps, down) : null;

  return (
    <ChartFrame
      title="Tráfego"
      subtitle="Entrada acima do eixo, saída abaixo. Mesma escala nos dois lados."
      series={TRAFFIC_SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
      table={<TrafficTable points={points} />}
    >
      <div ref={ref} className="relative">
        {!enough ? (
          <EmptyPlot height={HEIGHT} message="Aguardando amostras de tráfego." />
        ) : (
          <svg width={width} height={HEIGHT} role="img" aria-label="Tráfego de entrada e saída por segundo">
            {/* Eixo central e os dois topos de escala. */}
            <line x1={PAD.left} x2={PAD.left + plotW} y1={mid} y2={mid} stroke={GRID_COLOR} strokeWidth={1} shapeRendering="crispEdges" />
            <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top} y2={PAD.top} stroke={GRID_COLOR} strokeWidth={1} shapeRendering="crispEdges" />
            <line x1={PAD.left} x2={PAD.left + plotW} y1={PAD.top + plotH} y2={PAD.top + plotH} stroke={GRID_COLOR} strokeWidth={1} shapeRendering="crispEdges" />

            <text x={6} y={PAD.top + 9} fill={AXIS_TEXT} fontSize={10}>{formatBytes(yMax, "/s")}</text>
            <text x={6} y={mid + 3} fill={AXIS_TEXT} fontSize={10}>0</text>
            <text x={6} y={PAD.top + plotH} fill={AXIS_TEXT} fontSize={10}>{formatBytes(yMax, "/s")}</text>

            <path d={inBand!.area} fill={TRAFFIC_SERIES[0].color} fillOpacity={0.12} />
            <path d={inBand!.edge} fill="none" stroke={TRAFFIC_SERIES[0].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            <path d={outBand!.area} fill={TRAFFIC_SERIES[1].color} fillOpacity={0.12} />
            <path d={outBand!.edge} fill="none" stroke={TRAFFIC_SERIES[1].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            <XAxisLabels points={points.map((p) => p.t)} scaleX={scaleX} y={HEIGHT - 6} format={formatClock} />

            {hover && (
              <>
                <line x1={hover.x} x2={hover.x} y1={PAD.top} y2={PAD.top + plotH} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
                <circle cx={hover.x} cy={up(points[hover.index].inBps)} r={4} fill={TRAFFIC_SERIES[0].color} />
                <circle cx={hover.x} cy={down(points[hover.index].outBps)} r={4} fill={TRAFFIC_SERIES[1].color} />
              </>
            )}

            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={onLeave} />
          </svg>
        )}

        {enough && hover && (
          <Tooltip x={hover.x} width={width}>
            <p className="mb-1.5 text-[11px] tracking-[0.08em] text-muted">
              {formatClockSeconds(points[hover.index].t)}
            </p>
            <TooltipRow color={TRAFFIC_SERIES[0].color} label="Entrada" value={formatBytes(points[hover.index].inBps, "/s")} />
            <TooltipRow color={TRAFFIC_SERIES[1].color} label="Saída" value={formatBytes(points[hover.index].outBps, "/s")} />
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

function TrafficTable({ points }: { points: TrafficPoint[] }) {
  const rows = points.slice(-40).reverse();
  return (
    <table className="w-full border-collapse text-left text-[12.5px]">
      <caption className="sr-only">Tráfego de entrada e saída por segundo</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="label-caps py-2 pr-4 font-medium">Hora</th>
          <th scope="col" className="label-caps py-2 pr-4 text-right font-medium">Entrada</th>
          <th scope="col" className="label-caps py-2 pr-4 text-right font-medium">Saída</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.t} className="border-b border-line/50">
            <th scope="row" className="py-1.5 pr-4 font-mono text-[12px] font-normal text-muted">
              {formatClockSeconds(p.t)}
            </th>
            <td className="metric py-1.5 pr-4 text-right font-mono">{formatBytes(p.inBps, "/s")}</td>
            <td className="metric py-1.5 pr-4 text-right font-mono">{formatBytes(p.outBps, "/s")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
