/**
 * Minimal parser for the Prometheus text exposition format.
 *
 * Traefik expõe métricas por aí quando `metrics.prometheus` está ligado, e é
 * a ÚNICA fonte de contagem de requisições, latência e tráfego — a API REST
 * (/api/*) só descreve a configuração, nunca o volume.
 */

export interface Metric {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export type MetricIndex = Map<string, Metric[]>;

/** `name{a="1",b="2"} 3.5` — comentários e linhas vazias são ignorados. */
const LINE_RE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(-?[\d.]+(?:[eE][+-]?\d+)?|NaN|[+-]?Inf)$/;

function parseLabels(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;

  let i = 0;
  while (i < raw.length) {
    const eq = raw.indexOf("=", i);
    if (eq === -1) break;
    const key = raw.slice(i, eq).trim().replace(/^,/, "").trim();

    // O valor é sempre citado; aspas e barras podem vir escapadas.
    if (raw[eq + 1] !== '"') break;
    let j = eq + 2;
    let value = "";
    while (j < raw.length) {
      const ch = raw[j];
      if (ch === "\\") {
        const next = raw[j + 1];
        value += next === "n" ? "\n" : next === "t" ? "\t" : (next ?? "");
        j += 2;
        continue;
      }
      if (ch === '"') break;
      value += ch;
      j += 1;
    }
    if (key) out[key] = value;
    i = j + 1;
    while (i < raw.length && (raw[i] === "," || raw[i] === " ")) i += 1;
  }
  return out;
}

function parseValue(raw: string): number {
  if (raw === "NaN") return NaN;
  if (raw === "+Inf" || raw === "Inf") return Number.POSITIVE_INFINITY;
  if (raw === "-Inf") return Number.NEGATIVE_INFINITY;
  return Number(raw);
}

export function parsePrometheus(text: string): MetricIndex {
  const index: MetricIndex = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = LINE_RE.exec(trimmed);
    if (!m) continue;
    const metric: Metric = { name: m[1], labels: parseLabels(m[2]), value: parseValue(m[3]) };
    const bucket = index.get(metric.name);
    if (bucket) bucket.push(metric);
    else index.set(metric.name, [metric]);
  }
  return index;
}

export function seriesOf(index: MetricIndex, name: string): Metric[] {
  return index.get(name) ?? [];
}

/** Soma um contador, opcionalmente filtrando por labels. */
export function sumOf(index: MetricIndex, name: string, match?: Record<string, string>): number {
  let total = 0;
  for (const m of seriesOf(index, name)) {
    if (match && Object.entries(match).some(([k, v]) => m.labels[k] !== v)) continue;
    if (Number.isFinite(m.value)) total += m.value;
  }
  return total;
}

/**
 * Quantil a partir dos buckets cumulativos de um histograma.
 * `buckets` mapeia o limite superior (`le`) para a contagem acumulada.
 * Interpola linearmente dentro do bucket que cruza o alvo — é o mesmo que o
 * `histogram_quantile` do Prometheus faz, com a mesma imprecisão inerente.
 */
export function quantileFromBuckets(buckets: Map<number, number>, q: number): number | null {
  const ordered = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  if (ordered.length === 0) return null;

  const total = ordered[ordered.length - 1][1];
  if (!(total > 0)) return null;

  const target = q * total;
  let prevLe = 0;
  let prevCount = 0;

  for (const [le, count] of ordered) {
    if (count >= target) {
      if (!Number.isFinite(le)) return prevLe > 0 ? prevLe : null;
      const spanCount = count - prevCount;
      if (spanCount <= 0) return le;
      const ratio = (target - prevCount) / spanCount;
      return prevLe + (le - prevLe) * ratio;
    }
    prevLe = Number.isFinite(le) ? le : prevLe;
    prevCount = count;
  }
  return prevLe > 0 ? prevLe : null;
}

/** Extrai os buckets de um histograma, agrupados pelo valor de `le`. */
export function bucketsOf(
  index: MetricIndex,
  name: string,
  match?: Record<string, string>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of seriesOf(index, name)) {
    if (match && Object.entries(match).some(([k, v]) => m.labels[k] !== v)) continue;
    const le = m.labels.le === "+Inf" ? Number.POSITIVE_INFINITY : Number(m.labels.le);
    if (Number.isNaN(le)) continue;
    out.set(le, (out.get(le) ?? 0) + m.value);
  }
  return out;
}
