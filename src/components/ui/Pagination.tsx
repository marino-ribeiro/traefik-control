"use client";

import { useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "./primitives";

export const PAGE_SIZES = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const STORAGE_KEY = "traefik-control:page-size";
const CHANGE_EVENT = "traefik-control:page-size";

/*
 * Itens por página, lembrado por navegador (localStorage) e igual em todas
 * as tabelas. Lido com useSyncExternalStore: o servidor e a primeira pintura
 * usam o padrão, sem divergir na hidratação, e uma troca numa aba chega às
 * outras pelo evento `storage`. Storage bloqueado (aba privada, política do
 * navegador) só significa ficar no padrão.
 */
function readPageSize(): number {
  try {
    const n = Number(window.localStorage.getItem(STORAGE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function usePageSize(): [number, (size: number) => void] {
  const size = useSyncExternalStore(subscribe, readPageSize, () => DEFAULT_PAGE_SIZE);
  const set = (next: number) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* sem storage: vale só até recarregar */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [size, set];
}

/** Números a mostrar: primeira, última e vizinhas da atual, com "…" nos saltos. */
function pageList(current: number, total: number): (number | "gap")[] {
  const want = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...want].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(p - sorted[i - 1] === 2 ? p - 1 : "gap");
    out.push(p);
  });
  return out;
}

export function Pager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-control border px-2 text-[12px] tabular-nums transition-colors duration-200 ease-geist disabled:pointer-events-none disabled:opacity-30";

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/8 px-6 py-4"
    >
      <div className="flex items-center gap-4 text-[12px] text-muted">
        <span className="tabular-nums">
          {from}–{to} de {total}
        </span>
        <label className="flex items-center gap-2">
          <span className="label-caps">por página</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-control border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-fg hover:border-white/20 focus:border-red focus:outline-none"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={cx(btn, "border-white/10 text-muted hover:text-fg")}
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft size={14} aria-hidden />
          </button>
          {pageList(page, pageCount).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-[12px] text-muted/50" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Página ${p}`}
                className={cx(
                  btn,
                  p === page ? "btn-grad border-red text-fg" : "border-white/10 text-muted hover:text-fg",
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className={cx(btn, "border-white/10 text-muted hover:text-fg")}
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Próxima página"
          >
            <ChevronRight size={14} aria-hidden />
          </button>
        </div>
      )}
    </nav>
  );
}
