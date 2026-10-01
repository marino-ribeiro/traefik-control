import type { ComponentProps, ReactNode } from "react";
import type { ResourceStatus } from "@/lib/types";
import { STATUS_ICON, type LucideIcon } from "./icons";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-control font-bold uppercase tracking-[0.14em] " +
  "text-[13px] px-6 py-3 transition-[background,color,transform,border-color,box-shadow] " +
  "duration-200 ease-geist active:translate-y-0 disabled:pointer-events-none disabled:opacity-40";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "btn-grad text-fg shadow-red hover:bg-orange hover:bg-none hover:-translate-y-px hover:shadow-lift",
  ghost: "glass-tile text-muted hover:text-fg hover:shadow-soft",
  subtle: "text-muted hover:bg-white/5 hover:text-fg",
  danger: "border border-red/40 text-red hover:bg-red hover:text-fg",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

/** Botão só de ícone — precisa de rótulo acessível obrigatório. */
export function IconButton({
  Icon,
  label,
  className,
  ...props
}: ComponentProps<"button"> & { Icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 items-center justify-center rounded-control text-muted",
        "transition-colors duration-200 ease-geist hover:bg-white/8 hover:text-fg",
        className,
      )}
      {...props}
    >
      <Icon size={15} strokeWidth={2} aria-hidden />
    </button>
  );
}

/* ----------------------------------------------------------------- Panel */

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
  Icon,
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  Icon?: LucideIcon;
}) {
  return (
    <section className={cx("glass rounded-panel overflow-hidden", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-white/8 px-6 py-4">
          <div className="flex items-center gap-3">
            {Icon && <Icon size={18} className="shrink-0 text-red" aria-hidden />}
            <div>
              {eyebrow && <span className="eyebrow block">{eyebrow}</span>}
              {title && <h2 className="title-black text-[22px]">{title}</h2>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------ PageHeader */

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-white/8 pb-8">
      <div className="min-w-0">
        <span className="eyebrow block">{eyebrow}</span>
        <h1 className="title-black title-fade mt-2 text-[clamp(34px,5vw,52px)]">{title}</h1>
        {subtitle && <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/* ------------------------------------------------------------ StatusMark */

/**
 * Estado como ÍCONE, não como quadrado colorido.
 * A forma distingue sozinha em escala de cinza e no daltonismo; a cor é
 * reforço, nunca o único portador do significado.
 */
export function StatusMark({
  status,
  withLabel = false,
  size = 15,
}: {
  status?: ResourceStatus;
  withLabel?: boolean;
  size?: number;
}) {
  const { Icon, tone, label } = STATUS_ICON[status ?? "disabled"];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" title={label}>
      <Icon
        size={size}
        strokeWidth={2.2}
        className={cx("shrink-0", tone, status === "error" && "animate-pulse-dot")}
        aria-hidden
      />
      {withLabel && (
        <span className={cx("text-[11px] font-bold uppercase tracking-[0.16em]", tone)}>{label}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* ----------------------------------------------------------------- Badge */

export function Badge({
  children,
  tone = "neutral",
  Icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "red" | "orange" | "ok" | "warn";
  Icon?: LucideIcon;
}) {
  const tones = {
    neutral: "border-white/12 text-muted",
    red: "border-red/50 text-red",
    orange: "border-orange/50 text-orange",
    ok: "border-ok/40 text-ok",
    warn: "border-warn/40 text-warn",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-[5px] border px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.14em]",
        tones[tone],
      )}
    >
      {Icon && <Icon size={10} strokeWidth={2.5} aria-hidden />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Mono */

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <code className={cx("font-mono text-[12.5px] leading-relaxed text-fg/90", className)}>{children}</code>;
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({ title, hint, Icon }: { title: string; hint?: string; Icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
      {Icon ? (
        <Icon size={28} className="mb-2 text-muted/40" aria-hidden />
      ) : (
        <div aria-hidden className="mb-2 h-px w-12 bg-red" />
      )}
      <p className="title-black text-[20px] text-muted">{title}</p>
      {hint && <p className="max-w-[420px] text-[14px] text-muted/70">{hint}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- Notices */

export function Notice({ tone = "warn", children }: { tone?: "warn" | "error" | "info"; children: ReactNode }) {
  const tones = {
    warn: "border-warn/40 bg-warn/[0.07] text-warn",
    error: "border-red/40 bg-red/[0.07] text-red",
    info: "border-white/10 bg-white/[0.03] text-muted",
  } as const;
  const Icon = STATUS_ICON[tone === "error" ? "error" : tone === "warn" ? "warning" : "disabled"].Icon;
  return (
    <div
      className={cx("flex gap-3 rounded-control border px-5 py-4 text-[14px] leading-relaxed", tones[tone])}
      role="status"
    >
      <Icon size={16} strokeWidth={2.2} className="mt-[3px] shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ Form field */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-caps mb-2 block">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12px] text-red">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-[12px] text-muted/70">{hint}</span>
      )}
    </label>
  );
}

const CONTROL =
  "w-full rounded-control border border-white/10 bg-black/40 px-3 py-2.5 text-[14px] text-fg " +
  "placeholder:text-muted/50 transition-[border-color,box-shadow] duration-200 ease-geist " +
  "hover:border-white/20 focus:border-red focus:shadow-red focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(CONTROL, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(CONTROL, "font-mono text-[13px] leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cx(CONTROL, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export { cx };
