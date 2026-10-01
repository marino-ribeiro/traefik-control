"use client";

import Link from "next/link";
import { useState } from "react";
import type { RouterVolume } from "@/lib/metrics";
import { BAR_COLOR } from "./palette";
import { formatDuration, formatPercent, formatRps } from "./format";
import { ChartFrame, EmptyPlot, Tooltip, TooltipRow } from "./chart-kit";

const BAR_H = 14; // ≤24px por spec — a faixa sobrando vira ar

/**
 * Barras horizontais: uma série, um matiz. O comprimento já codifica a
 * magnitude — colorir cada barra por tamanho seria duplicar a informação e
 * gastar o único canal livre.
 *
 * Horizontal porque nome de router é longo e roda com `@provider`.
 */
export function TopRouters({ routers }: { routers: RouterVolume[] }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  return (
    <ChartFrame
      title="Routers por volume"
      subtitle="Requisições por segundo na última janela, do maior para o menor."
      table={<RouterTable routers={routers} />}
    >
      <div className="relative px-4 pt-1 pb-2">
        {routers.length === 0 ? (
          <EmptyPlot height={180} message="Nenhum router registrou tráfego nesta janela." />
        ) : (
          <ul className="space-y-3">
            {routers.map((r, i) => (
              <li
                key={r.router}
                onPointerEnter={(e) =>
                  setHover({ i, x: e.nativeEvent.offsetX + 40, y: 0 })
                }
                onPointerLeave={() => setHover(null)}
              >
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <Link
                    href={`/routers?q=${encodeURIComponent(r.router)}`}
                    className="truncate font-mono text-[12.5px] text-fg/90 underline-offset-4 transition-colors hover:text-red hover:underline"
                  >
                    {r.router}
                  </Link>
                  {/* Rótulo direto: com ≤8 itens o número fica na barra, sem eixo. */}
                  <span className="metric shrink-0 font-mono text-[12.5px] text-muted">
                    {formatRps(r.rps)}/s
                  </span>
                </div>
                <div className="h-[14px] w-full" style={{ height: BAR_H }}>
                  <svg width="100%" height={BAR_H} role="presentation">
                    <rect x={0} y={0} width="100%" height={BAR_H} fill="rgba(255,255,255,0.04)" rx={4} />
                    {/* Ponta arredondada em 4px no lado do dado, reta na base. */}
                    <rect
                      x={0}
                      y={0}
                      width={`${Math.max(0.6, r.share * 100)}%`}
                      height={BAR_H}
                      fill={BAR_COLOR}
                      rx={4}
                    />
                    <rect x={0} y={0} width={4} height={BAR_H} fill={BAR_COLOR} />
                  </svg>
                </div>
              </li>
            ))}
          </ul>
        )}

        {hover && routers[hover.i] && (
          <Tooltip x={hover.x} width={640}>
            <p className="mb-1.5 truncate font-mono text-[11px] text-muted">{routers[hover.i].router}</p>
            <TooltipRow label="taxa" value={`${formatRps(routers[hover.i].rps)}/s`} />
            <TooltipRow label="erro" value={formatPercent(routers[hover.i].errorRate)} />
            <TooltipRow label="p95" value={formatDuration(routers[hover.i].p95)} />
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

function RouterTable({ routers }: { routers: RouterVolume[] }) {
  return (
    <table className="w-full border-collapse text-left text-[12.5px]">
      <caption className="sr-only">Routers por volume de requisições</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="label-caps py-2 pr-4 font-medium">Router</th>
          <th scope="col" className="label-caps py-2 pr-4 text-right font-medium">req/s</th>
          <th scope="col" className="label-caps py-2 pr-4 text-right font-medium">Erro</th>
          <th scope="col" className="label-caps py-2 text-right font-medium">p95</th>
        </tr>
      </thead>
      <tbody>
        {routers.map((r) => (
          <tr key={r.router} className="border-b border-line/50">
            <th scope="row" className="py-1.5 pr-4 font-mono text-[12px] font-normal">{r.router}</th>
            <td className="metric py-1.5 pr-4 text-right font-mono">{formatRps(r.rps)}</td>
            <td className="metric py-1.5 pr-4 text-right font-mono">{formatPercent(r.errorRate)}</td>
            <td className="metric py-1.5 text-right font-mono">{formatDuration(r.p95)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
