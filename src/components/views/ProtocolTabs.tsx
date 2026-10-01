"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

export function ProtocolTabs({
  value,
  onChange,
  counts,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  counts: Record<string, number>;
  options: { key: string; label: string }[];
}) {
  return (
    <div role="tablist" aria-label="Protocolo" className="flex gap-px">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cx(
              "flex items-baseline gap-2 rounded-control border px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors duration-200 ease-geist",
              active
                ? "btn-grad border-red text-fg shadow-red"
                : "glass-tile text-muted hover:text-fg",
            )}
          >
            {o.label}
            <span className={cx("text-[11px] tabular-nums", active ? "text-fg/70" : "text-muted/60")}>
              {counts[o.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Key/value grid used inside every expanded table row. */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">{children}</dl>;
}

export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label-caps mb-1.5">{label}</dt>
      <dd className="text-[13.5px] leading-relaxed break-words text-fg/90">{children}</dd>
    </div>
  );
}
