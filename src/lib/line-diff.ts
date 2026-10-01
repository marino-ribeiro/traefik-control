/**
 * Diff de linhas (LCS) para mostrar o que muda antes de restaurar um backup.
 * Sem dependência: o dynamic.yml tem centenas de linhas, e uma tabela
 * n×m cabe folgada. Acima de MAX_CELLS desiste em vez de travar a aba.
 */

export type DiffLine = { op: "same" | "add" | "del"; text: string };

export type DiffHunk = { lines: DiffLine[]; skippedBefore: number };

const MAX_CELLS = 4_000_000;

export function diffLines(before: string, after: string): DiffLine[] | null {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  if ((n + 1) * (m + 1) > MAX_CELLS) return null;

  /* lcs[i][j] = tamanho da maior subsequência comum de a[i..] e b[j..]. */
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      out.push({ op: "del", text: a[i] });
      i += 1;
    } else {
      out.push({ op: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) out.push({ op: "del", text: a[i++] });
  while (j < m) out.push({ op: "add", text: b[j++] });
  return out;
}

/** Agrupa em trechos com `context` linhas iguais em volta de cada mudança. */
export function hunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.op === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k += 1) keep[k] = true;
  });

  const out: DiffHunk[] = [];
  let skipped = 0;
  let current: DiffHunk | null = null;
  lines.forEach((l, idx) => {
    if (!keep[idx]) {
      skipped += 1;
      current = null;
      return;
    }
    if (!current) {
      current = { lines: [], skippedBefore: skipped };
      out.push(current);
      skipped = 0;
    }
    current.lines.push(l);
  });
  return out;
}
