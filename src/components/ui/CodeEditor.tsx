"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { cx } from "./primitives";

/*
 * Editor de código mínimo: um <textarea> de verdade (seleção, colar, undo e
 * leitor de tela vêm do navegador) com duas camadas sincronizadas por scroll
 * — a calha de números de linha e as guias de indentação por trás do texto.
 *
 * Tudo depende de uma grade fixa: fonte mono, altura de linha em px e sem
 * quebra de linha (wrap="off"). Com quebra, uma linha lógica ocuparia várias
 * visuais e os números desalinhariam.
 */

const LINE_PX = 20;
const PAD_Y = 10;

export type CodeLanguage = "yaml" | "json";

export function CodeEditor({
  value,
  onChange,
  language,
  rows = 12,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [caret, setCaret] = useState({ line: 0, col: 0 });
  /* Ctrl+M: devolve o Tab à navegação, para quem usa só o teclado. */
  const [tabTraps, setTabTraps] = useState(true);

  const lines = useMemo(() => value.split("\n"), [value]);
  const unit = useMemo(() => indentUnit(lines), [lines]);
  const guides = useMemo(() => guideLevels(lines, unit), [lines, unit]);
  const gutterCh = Math.max(2, String(lines.length).length);

  function syncCaret() {
    const el = ref.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const line = before.split("\n").length - 1;
    setCaret({ line, col: el.selectionStart - (before.lastIndexOf("\n") + 1) });
  }

  function onScroll(e: UIEvent<HTMLTextAreaElement>) {
    setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft });
  }

  /**
   * Substitui [start, end) por `text` mantendo o desfazer do navegador:
   * `insertText` entra na pilha de undo; atribuir `value` direto a apagaria.
   */
  function replace(start: number, end: number, text: string, select?: [number, number]) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
    const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
    if (!ok) {
      el.setRangeText(text, start, end, "end");
      onChange(el.value);
    }
    if (select) el.setSelectionRange(select[0], select[1]);
    syncCaret();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: t, value: v } = el;

    if (e.key === "m" && e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      setTabTraps((on) => !on);
      return;
    }

    if (e.key === "Tab" && tabTraps && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      const multiline = v.slice(s, t).includes("\n");

      if (!multiline && !e.shiftKey) {
        /* Até a próxima coluna múltipla da unidade, como num editor. */
        const col = s - lineStart;
        replace(s, t, " ".repeat(unit - (col % unit)));
        return;
      }

      /* Bloco: indenta/desindenta cada linha tocada pela seleção. */
      const blockEnd = t > s && v[t - 1] === "\n" ? t - 1 : t;
      const endBreak = v.indexOf("\n", blockEnd);
      const end = endBreak === -1 ? v.length : endBreak;
      const block = v.slice(lineStart, end).split("\n");
      const changed = block.map((l) =>
        e.shiftKey ? l.replace(new RegExp(`^ {1,${unit}}|^\\t`), "") : l.length ? " ".repeat(unit) + l : l,
      );
      const text = changed.join("\n");
      if (text === block.join("\n")) return;
      const firstDelta = changed[0].length - block[0].length;
      const selStart = Math.max(lineStart, s + firstDelta);
      replace(lineStart, end, text, multiline ? [lineStart, lineStart + text.length] : [selStart, selStart]);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      const current = v.slice(lineStart, s);
      const indent = current.match(/^[ \t]*/)?.[0] ?? "";
      const head = current.trimEnd();
      const opens = language === "yaml" ? /:$|^\s*-$/.test(head) : /[[{]$/.test(head);
      const next = indent + (opens ? " ".repeat(unit) : "");

      /* JSON: Enter entre `{}`/`[]` abre o bloco e fecha na linha de baixo. */
      const after = v[t];
      if (language === "json" && opens && (after === "}" || after === "]")) {
        const text = `\n${next}\n${indent}`;
        const caretAt = s + 1 + next.length;
        replace(s, t, text, [caretAt, caretAt]);
        return;
      }
      replace(s, t, `\n${next}`);
    }
  }

  const height = rows * LINE_PX + PAD_Y * 2;

  return (
    <div>
      <div
        className={cx(
          "grid grid-cols-[auto_1fr] overflow-hidden rounded-control border border-white/10 bg-black/40",
          "font-mono text-[13px] transition-[border-color,box-shadow] duration-200 ease-geist",
          "hover:border-white/20 focus-within:border-red focus-within:shadow-red",
        )}
        style={{ lineHeight: `${LINE_PX}px` }}
      >
        {/* Calha: números, alinhados à direita, rolando junto com o texto.
            Largura fixa e lista em absolute: a calha não pode ditar a altura
            da linha do grid — quem manda é o textarea (e o redimensionar
            dele). Em fluxo, as N linhas esticavam o editor além do texto. */}
        <div
          aria-hidden
          className="relative select-none overflow-hidden border-r border-white/8 bg-white/[0.02]"
          style={{ width: `calc(${gutterCh}ch + 1.5rem)` }}
        >
          <div
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${-scroll.top}px)`, padding: `${PAD_Y}px 0` }}
          >
            {lines.map((_, i) => (
              <div
                key={i}
                className={cx(
                  "px-3 text-right tabular-nums",
                  i === caret.line ? "text-fg/80" : "text-muted/40",
                )}
                style={{ height: LINE_PX }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="relative min-w-0">
          {/* Guias de indentação e realce da linha atual, por trás do texto. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              style={{
                transform: `translate(${-scroll.left}px, ${-scroll.top}px)`,
                padding: `${PAD_Y}px 0`,
              }}
            >
              {guides.map((levels, i) => (
                <div
                  key={i}
                  className={cx("relative", i === caret.line && "bg-white/[0.035]")}
                  style={{ height: LINE_PX }}
                >
                  {Array.from({ length: levels }, (_, k) => (
                    <span
                      key={k}
                      className="absolute inset-y-0 w-px bg-white/[0.08]"
                      style={{ left: `calc(0.75rem + ${k * unit}ch)` }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              syncCaret();
            }}
            onKeyDown={onKeyDown}
            onSelect={syncCaret}
            onScroll={onScroll}
            placeholder={placeholder}
            aria-label={ariaLabel}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            className={cx(
              "scroll-slim relative block w-full resize-y overflow-auto whitespace-pre bg-transparent px-3 text-fg",
              "caret-red placeholder:text-muted/40 focus:outline-none",
            )}
            style={{ height, minHeight: 4 * LINE_PX + PAD_Y * 2, paddingTop: PAD_Y, paddingBottom: PAD_Y, tabSize: unit }}
          />
        </div>
      </div>

      {/* Barra de status, como a de uma IDE. */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 font-mono text-[11px] text-muted/70">
        <span className="tabular-nums">
          Ln {caret.line + 1}, Col {caret.col + 1} · {lines.length} {lines.length === 1 ? "linha" : "linhas"}
        </span>
        <span className="flex items-center gap-3">
          <span>Espaços: {unit}</span>
          <span className="uppercase">{language}</span>
          <span title="Ctrl+M alterna entre Tab indentar e Tab navegar entre os campos">
            {tabTraps ? "Tab indenta · Ctrl+M libera" : "Tab navega · Ctrl+M volta"}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Largura de um nível: o menor recuo não-nulo do texto (2 se não houver). */
function indentUnit(lines: string[]): number {
  let min = Infinity;
  for (const l of lines) {
    const n = leading(l, 2);
    if (n > 0 && l.trim()) min = Math.min(min, n);
  }
  return Number.isFinite(min) ? Math.min(Math.max(min, 1), 8) : 2;
}

function leading(line: string, tab: number): number {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n += 1;
    else if (ch === "\t") n += tab;
    else break;
  }
  return n;
}

/**
 * Quantas guias cada linha mostra. Linhas em branco herdam o menor recuo
 * entre a anterior e a próxima com conteúdo, para a guia não se partir no
 * meio de um bloco — o mesmo que o VS Code faz.
 */
function guideLevels(lines: string[], unit: number): number[] {
  const indents = lines.map((l) => (l.trim() ? leading(l, unit) : null));
  const out: number[] = new Array(lines.length).fill(0);
  let prev = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const own = indents[i];
    if (own !== null) {
      prev = own;
      out[i] = Math.floor(own / unit);
      continue;
    }
    let next = 0;
    for (let j = i + 1; j < lines.length; j += 1) {
      const n = indents[j];
      if (n !== null) {
        next = n;
        break;
      }
    }
    out[i] = Math.floor(Math.min(prev, next) / unit);
  }
  return out;
}
