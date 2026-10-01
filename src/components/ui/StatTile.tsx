import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./primitives";
import type { LucideIcon } from "./icons";

/**
 * Número grande sobre micro-rótulo em caixa alta. Quando há tendência, a
 * faísca entra ao lado — nunca um gráfico de uma barra só.
 */
export function StatTile({
  label,
  value,
  detail,
  href,
  tone = "neutral",
  Icon,
  spark,
}: {
  label: string;
  value: number | string;
  detail?: ReactNode;
  href?: string;
  tone?: "neutral" | "red" | "warn" | "ok";
  Icon?: LucideIcon;
  spark?: ReactNode;
}) {
  /* Só o tom neutro recebe o fade; nos tons semânticos a cor é sinal. */
  const accent = {
    neutral: "title-fade",
    red: "text-red",
    warn: "text-warn",
    ok: "text-ok",
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="label-caps block">{label}</span>
        {Icon && <Icon size={15} className="shrink-0 text-muted/50" aria-hidden />}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className={cx("title-black metric block text-[42px] leading-none", accent)}>{value}</span>
        {spark && <span className="shrink-0 pb-1">{spark}</span>}
      </div>
      {detail && <span className="mt-2 block text-[13px] leading-snug text-muted">{detail}</span>}
    </>
  );

  const shell =
    "glass-tile rounded-tile block px-6 py-6 transition-[background,box-shadow,transform] duration-200 ease-geist " +
    (href ? "hover:-translate-y-px hover:bg-white/6 hover:shadow-lift" : "");

  return href ? (
    <Link href={href} className={cx(shell, "group")}>
      {body}
      <span className="mt-4 block text-[11px] font-bold uppercase tracking-[0.18em] text-muted transition-colors duration-200 ease-geist group-hover:text-red">
        ver tudo →
      </span>
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
