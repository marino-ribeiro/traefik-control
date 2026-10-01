"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AXIS_TEXT, GRID_COLOR } from "./palette";

/** Mede o container para renderizar em pixels reais — escalar o SVG por
 *  viewBox distorceria traços e texto. */
export function useChartWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(0, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    setWidth(Math.max(0, Math.floor(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);

  return [ref, width];
}

export interface Series {
  key: string;
  label: string;
  color: string;
  hint?: string;
}

/**
 * Moldura comum: título, legenda e a tabela equivalente.
 *
 * A tabela não é enfeite — é o caminho de leitura para quem usa leitor de
 * tela e a saída para quem não distingue as cores. O guia de dataviz exige
 * que ela exista.
 */
export function ChartFrame({
  title,
  subtitle,
  series,
  children,
  table,
  action,
}: {
  title: string;
  subtitle?: string;
  series?: Series[];
  children: ReactNode;
  table?: ReactNode;
  action?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <figure className="glass rounded-panel m-0 overflow-hidden">
      <figcaption className="flex flex-wrap items-start justify-between gap-4 px-6 pt-5 pb-4">
        <div className="min-w-0">
          <h3 className="title-black text-[17px]">{title}</h3>
          {subtitle && <p className="mt-1 text-[12.5px] leading-snug text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          {series && series.length >= 2 && <Legend series={series} />}
          {action}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-expanded={showTable}
              className="rounded-control border border-line px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted transition-colors duration-200 ease-geist hover:border-line-strong hover:text-fg"
            >
              {showTable ? "gráfico" : "tabela"}
            </button>
          )}
        </div>
      </figcaption>

      {showTable && table ? (
        <div className="scroll-slim max-h-[300px] overflow-auto px-6 pb-6">{table}</div>
      ) : (
        <div className="px-2 pb-4">{children}</div>
      )}
    </figure>
  );
}

/** Legenda sempre presente a partir de 2 séries — identidade nunca só por cor. */
export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-[2px]"
            style={{ background: s.color }}
          />
          <span className="text-[11px] font-medium tracking-[0.04em] text-muted">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- eixos */

export function GridLines({
  ticks,
  x0,
  x1,
  scaleY,
}: {
  ticks: number[];
  x0: number;
  x1: number;
  scaleY: (v: number) => number;
}) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <line
          key={t}
          x1={x0}
          x2={x1}
          y1={scaleY(t)}
          y2={scaleY(t)}
          stroke={GRID_COLOR}
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
}

export function YAxisLabels({
  ticks,
  x,
  scaleY,
  format,
}: {
  ticks: number[];
  x: number;
  scaleY: (v: number) => number;
  format: (v: number) => string;
}) {
  return (
    <g aria-hidden>
      {ticks.map((t) => (
        <text
          key={t}
          x={x}
          y={scaleY(t) - 4}
          fill={AXIS_TEXT}
          fontSize={10}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {format(t)}
        </text>
      ))}
    </g>
  );
}

export function XAxisLabels({
  points,
  scaleX,
  y,
  format,
  count = 5,
}: {
  points: number[];
  scaleX: (i: number) => number;
  y: number;
  format: (t: number) => string;
  count?: number;
}) {
  if (points.length === 0) return null;
  const step = Math.max(1, Math.floor(points.length / count));
  const idxs: number[] = [];
  for (let i = 0; i < points.length; i += step) idxs.push(i);

  return (
    <g aria-hidden>
      {idxs.map((i) => (
        <text
          key={i}
          x={scaleX(i)}
          y={y}
          fill={AXIS_TEXT}
          fontSize={10}
          textAnchor={i === 0 ? "start" : "middle"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {format(points[i])}
        </text>
      ))}
    </g>
  );
}

/* ----------------------------------------------------------- tooltip */

export interface HoverState {
  index: number;
  x: number;
}

/**
 * Camada de captura do mouse: um retângulo transparente sobre a área de
 * plotagem, para o alvo do ponteiro ser maior que as marcas.
 */
export function useHover(
  count: number,
  padLeft: number,
  plotWidth: number,
): [HoverState | null, (e: React.PointerEvent<SVGRectElement>) => void, () => void] {
  const [hover, setHover] = useState<HoverState | null>(null);

  const onMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (count === 0 || plotWidth <= 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = e.clientX - rect.left;
      const ratio = Math.min(1, Math.max(0, rel / plotWidth));
      const index = Math.min(count - 1, Math.round(ratio * (count - 1)));
      setHover({ index, x: padLeft + (count === 1 ? 0 : (index / (count - 1)) * plotWidth) });
    },
    [count, padLeft, plotWidth],
  );

  const onLeave = useCallback(() => setHover(null), []);
  return [hover, onMove, onLeave];
}

export function Tooltip({
  x,
  width,
  children,
}: {
  x: number;
  width: number;
  children: ReactNode;
}) {
  /* Vira de lado perto da borda direita para não sair da moldura. */
  const flip = x > width - 150;
  return (
    <div
      className="glass pointer-events-none absolute top-2 z-10 min-w-[132px] rounded-control px-3 py-2"
      style={flip ? { right: width - x + 10 } : { left: x + 10 }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-[12px] leading-relaxed">
      <span className="flex items-center gap-1.5 text-muted">
        {color && (
          <span aria-hidden className="inline-block size-2 rounded-[2px]" style={{ background: color }} />
        )}
        {label}
      </span>
      <span className="metric font-mono text-fg">{value}</span>
    </div>
  );
}

export function EmptyPlot({ height, message }: { height: number; message: string }) {
  return (
    <div
      className="flex items-center justify-center px-6 text-center text-[13px] leading-relaxed text-muted"
      style={{ height }}
    >
      {message}
    </div>
  );
}
