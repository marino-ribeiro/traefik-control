"use client";

import { Fragment } from "react";
import type { StatusPoint } from "@/lib/metrics";
import { STATUS_SERIES } from "./palette";
import { formatClockSeconds, formatRps, niceCeil } from "./format";
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
import { formatClock } from "./format";

const HEIGHT = 210;
const PAD = { top: 14, right: 14, bottom: 22, left: 46 };

/** Requisições por segundo, empilhadas por classe de status HTTP. */
export function StackedAreaChart({ points }: { points: StatusPoint[] }) {
  const [ref, width] = useChartWidth();
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const [hover, onMove, onLeave] = useHover(points.length, PAD.left, plotW);

  const totals = points.map((p) => p.c2xx + p.c3xx + p.c4xx + p.c5xx);
  const yMax = niceCeil(Math.max(...totals, 0.001));
  const scaleY = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const scaleX = (i: number) => PAD.left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * plotW);
  const ticks = [0, yMax / 2, yMax];

  const series = STATUS_SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color, hint: s.hint }));

  const enough = points.length >= 2 && width > 0;

  return (
    <ChartFrame
      title="Requisições por segundo"
      subtitle="Empilhado por classe de status. Passe o mouse para os valores do instante."
      series={series}
      table={<StatusTable points={points} />}
    >
      {/* O container carrega o ref e existe SEMPRE — sem ele o ResizeObserver
          nunca mede, e o gráfico ficaria preso em largura zero. */}
      <div ref={ref} className="relative">
        {!enough ? (
          <EmptyPlot
            height={HEIGHT}
            message="Aguardando a segunda amostra — taxa exige duas leituras do contador."
          />
        ) : (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Requisições por segundo por classe de status, ${points.length} amostras`}
          >
            <GridLines ticks={ticks} x0={PAD.left} x1={PAD.left + plotW} scaleY={scaleY} />
            <YAxisLabels ticks={ticks} x={6} scaleY={scaleY} format={(v) => formatRps(v)} />

            {/* Empilha de baixo para cima: 2xx na base, 5xx no topo. Assim as
                duas cores que colidem no daltonismo nunca ficam vizinhas. */}
            {(() => {
              const baseline = new Array(points.length).fill(0);
              return STATUS_SERIES.map((s) => {
                const top = points.map((p, i) => baseline[i] + p[s.key]);
                const area = [
                  ...points.map((_, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(top[i])}`),
                  ...points
                    .map((_, i) => points.length - 1 - i)
                    .map((i) => `L${scaleX(i)},${scaleY(baseline[i])}`),
                  "Z",
                ].join(" ");
                const edge = points
                  .map((_, i) => `${i === 0 ? "M" : "L"}${scaleX(i)},${scaleY(top[i])}`)
                  .join(" ");
                for (let i = 0; i < points.length; i += 1) baseline[i] = top[i];

                return (
                  <Fragment key={s.key}>
                    <path d={area} fill={s.color} fillOpacity={0.16} />
                    {/* Traço escuro por baixo = o vão de 2px que separa as faixas. */}
                    <path d={edge} fill="none" stroke="#05050a" strokeWidth={3.5} strokeLinejoin="round" />
                    <path
                      d={edge}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </Fragment>
                );
              });
            })()}

            <XAxisLabels points={points.map((p) => p.t)} scaleX={scaleX} y={HEIGHT - 6} format={formatClock} />

            {hover && (
              <line
                x1={hover.x}
                x2={hover.x}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1}
              />
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
            {STATUS_SERIES.map((s) => (
              <TooltipRow
                key={s.key}
                color={s.color}
                label={s.label}
                value={`${formatRps(points[hover.index][s.key])}/s`}
              />
            ))}
            <div className="mt-1.5 border-t border-line pt-1.5">
              <TooltipRow label="total" value={`${formatRps(totals[hover.index])}/s`} />
            </div>
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

function StatusTable({ points }: { points: StatusPoint[] }) {
  const rows = points.slice(-40).reverse();
  return (
    <table className="w-full border-collapse text-left text-[12.5px]">
      <caption className="sr-only">Requisições por segundo por classe de status</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="label-caps py-2 pr-4 font-medium">Hora</th>
          {STATUS_SERIES.map((s) => (
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
            {STATUS_SERIES.map((s) => (
              <td key={s.key} className="metric py-1.5 pr-4 text-right font-mono">
                {formatRps(p[s.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
