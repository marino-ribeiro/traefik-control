"use client";

import { useId } from "react";

/**
 * Faísca para os tiles de KPI: sem eixo, sem grade, sem rótulo. Só a forma
 * da tendência ao lado do número — o número é que é o dado.
 */
export function Sparkline({
  values,
  color,
  width = 108,
  height = 32,
  label,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
  label: string;
}) {
  const gradId = useId();
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return <div style={{ width, height }} aria-hidden />;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => (i / (clean.length - 1)) * (width - pad * 2) + pad;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const line = clean.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(clean.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;

  return (
    <svg width={width} height={height} role="img" aria-label={label} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(clean.length - 1)} cy={y(clean[clean.length - 1])} r={2.5} fill={color} />
    </svg>
  );
}
