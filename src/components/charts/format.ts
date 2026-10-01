/** Formatadores compartilhados pelos gráficos e pelos tiles. */

export function formatRps(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/** Latência chega em segundos; humano lê em ms até virar segundo. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const ms = seconds * 1000;
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
  return `${seconds.toFixed(2)}s`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number, suffix = ""): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 B${suffix}`;
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${BYTE_UNITS[i]}${suffix}`;
}

export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatClock(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatClockSeconds(t: number): string {
  const d = new Date(t);
  return `${formatClock(t)}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/** Escala "bonita" para o topo do eixo Y — 1, 2, 2.5 ou 5 vezes potência de 10. */
export function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const pow = 10 ** exp;
  const frac = v / pow;
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return step * pow;
}
