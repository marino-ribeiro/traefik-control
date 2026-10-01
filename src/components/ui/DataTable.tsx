"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cx, EmptyState } from "./primitives";
import { Pager, usePageSize } from "./Pagination";
import type { LucideIcon } from "./icons";

export interface Column<T> {
  key: string;
  header: string;
  /** Cell content. Falls back to the sort value when omitted. */
  render?: (row: T) => ReactNode;
  /** Sortable when provided. */
  sortValue?: (row: T) => string | number;
  className?: string;
  headClassName?: string;
}

export interface Filter<T> {
  key: string;
  label: string;
  value: (row: T) => string | undefined;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Free-text search corpus per row. */
  searchable?: (row: T) => (string | undefined)[];
  filters?: Filter<T>[];
  /** Expanded panel rendered under the row when it is clicked. */
  detail?: (row: T) => ReactNode;
  emptyTitle?: string;
  emptyHint?: string;
  emptyIcon?: LucideIcon;
  /** Busca já preenchida ao abrir — ex.: `?q=` vindo de um link. */
  initialQuery?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchable,
  filters = [],
  detail,
  emptyTitle = "Nada por aqui",
  emptyHint,
  emptyIcon,
  initialQuery = "",
}: Props<T>) {
  const [query, setQueryRaw] = useState(initialQuery);
  const [active, setActiveRaw] = useState<Record<string, string>>({});
  const [sort, setSortRaw] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  /* Veio de um link apontando para uma linha exata: já abre o detalhe dela. */
  const [open, setOpen] = useState<string | null>(() =>
    initialQuery && rows.some((r) => rowKey(r) === initialQuery) ? initialQuery : null,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeStored] = usePageSize();

  /* Mudar busca, filtro, ordem ou tamanho volta para a página 1: ficar na
     página 4 de um resultado que agora tem uma só mostraria tela vazia. */
  const setQuery = (q: string) => {
    setQueryRaw(q);
    setPage(1);
  };
  const setActive: typeof setActiveRaw = (v) => {
    setActiveRaw(v);
    setPage(1);
  };
  const setSort: typeof setSortRaw = (v) => {
    setSortRaw(v);
    setPage(1);
  };
  const setPageSize = (n: number) => {
    setPageSizeStored(n);
    setPage(1);
  };

  const options = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      const seen = new Set<string>();
      for (const row of rows) {
        const v = f.value(row);
        if (v) seen.add(v);
      }
      map[f.key] = [...seen].sort();
    }
    return map;
  }, [rows, filters]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let out = rows.filter((row) => {
      for (const f of filters) {
        const want = active[f.key];
        if (want && f.value(row) !== want) return false;
      }
      if (!needle) return true;
      const corpus = searchable?.(row) ?? [];
      return corpus.some((s) => s?.toLowerCase().includes(needle));
    });

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        const get = col.sortValue;
        out = [...out].sort((a, b) => {
          const av = get(a);
          const bv = get(b);
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * sort.dir;
        });
      }
    }
    return out;
  }, [rows, filters, active, query, searchable, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  /* As linhas mudam por fora (refresh depois de remover uma): não fica
     preso numa página que deixou de existir. */
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key: string) =>
    setSort((prev) => (prev?.key === key ? (prev.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));

  const hasControls = Boolean(searchable) || filters.length > 0;

  return (
    <div>
      {hasControls && (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-white/8 px-6 py-4">
          {searchable && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar na tabela"
              className="min-w-[200px] flex-1 rounded-control border border-white/10 bg-black/40 px-3 py-2 text-[14px] text-fg transition-[border-color,box-shadow] duration-200 ease-geist placeholder:text-muted/50 hover:border-white/20 focus:border-red focus:shadow-red focus:outline-none"
            />
          )}
          {filters.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <span className="label-caps">{f.label}</span>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  active={!active[f.key]}
                  onClick={() => setActive((s) => ({ ...s, [f.key]: "" }))}
                >
                  todos
                </FilterChip>
                {(options[f.key] ?? []).map((opt) => (
                  <FilterChip
                    key={opt}
                    active={active[f.key] === opt}
                    onClick={() => setActive((s) => ({ ...s, [f.key]: opt }))}
                  >
                    {opt}
                  </FilterChip>
                ))}
              </div>
            </div>
          ))}
          <span className="ml-auto text-[12px] tabular-nums text-muted">
            {visible.length}/{rows.length}
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} Icon={emptyIcon} />
      ) : (
        <div className="scroll-slim overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/8">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cx("label-caps px-6 py-3 font-medium whitespace-nowrap", c.headClassName)}
                    aria-sort={
                      sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                    }
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1.5 uppercase tracking-[0.18em] transition-colors hover:text-fg"
                      >
                        {c.header}
                        <span aria-hidden className={cx("text-[9px]", sort?.key === c.key ? "text-red" : "text-muted/40")}>
                          {sort?.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "◆"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
                {detail && <th scope="col" className="w-10 px-6 py-3" />}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const key = rowKey(row);
                const isOpen = open === key;
                return (
                  <FragmentRow
                    key={key}
                    isOpen={isOpen}
                    columns={columns}
                    row={row}
                    detail={detail}
                    onToggle={() => setOpen(isOpen ? null : key)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visible.length > 0 && (
        <Pager
          page={current}
          pageCount={pageCount}
          pageSize={pageSize}
          total={visible.length}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      )}
    </div>
  );
}

function FragmentRow<T>({
  row,
  columns,
  detail,
  isOpen,
  onToggle,
}: {
  row: T;
  columns: Column<T>[];
  detail?: (row: T) => ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={cx(
          "border-b border-white/6 transition-colors duration-200 ease-geist",
          detail && "cursor-pointer",
          isOpen ? "bg-white/6" : "hover:bg-white/4",
        )}
        onClick={detail ? onToggle : undefined}
      >
        {columns.map((c) => (
          <td key={c.key} className={cx("px-6 py-4 align-top text-[14px]", c.className)}>
            {c.render ? c.render(row) : String(c.sortValue?.(row) ?? "")}
          </td>
        ))}
        {detail && (
          <td className="px-6 py-4 align-top">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-label={isOpen ? "Recolher detalhes" : "Expandir detalhes"}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className={cx(
                "text-[11px] transition-transform duration-200",
                isOpen ? "rotate-90 text-red" : "text-muted",
              )}
            >
              ▶
            </button>
          </td>
        )}
      </tr>
      {detail && isOpen && (
        <tr className="border-b border-white/8 bg-black/30">
          <td colSpan={columns.length + 1} className="px-6 py-6">
            {detail(row)}
          </td>
        </tr>
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-[4px] border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 ease-geist",
        active ? "btn-grad border-red text-fg" : "border-white/12 text-muted hover:border-white/25 hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
