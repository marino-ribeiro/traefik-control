/**
 * Paleta dos gráficos.
 *
 * Validada com o `validate_palette.js` do guia de dataviz contra a superfície
 * real (#0a0a0a — o vidro sobre preto OLED), não contra a superfície padrão
 * do guia. Resultados registrados aqui para não se repetir a análise:
 *
 *  · Tráfego (2 categóricos)      ALL PASS — CVD ΔE 26.8, normal 31.8
 *  · Latência (ordinal, 1 matiz)  ALL PASS — L monótona, ponta clara 2.99:1
 *  · Status HTTP (4 estados)      PASS nos testes aplicáveis: CVD adjacente
 *    ΔE 10.4, visão normal 15.7, contraste ≥3:1 nos quatro.
 *
 * Sobre o status: a faixa de luminância e o piso de croma acusam FAIL, mas
 * são testes de paleta CATEGÓRICA e não se aplicam aqui — a paleta de status
 * é reservada e fixa, e o cinza do 3xx é deliberadamente neutro (redirect não
 * é identidade de série, é ausência de julgamento). O par perigoso é
 * 2xx↔5xx (ΔE 4.1 no deuteranopia, verde×vermelho): na área empilhada eles
 * NUNCA ficam adjacentes, porque 3xx e 4xx sempre se interpõem. E, como manda
 * o guia, todo status vem com ícone + rótulo — a cor nunca carrega o sentido
 * sozinha.
 */

export const STATUS_SERIES = [
  { key: "c2xx", label: "2xx", hint: "sucesso", color: "#0ca30c" },
  { key: "c3xx", label: "3xx", hint: "redirecionamento", color: "#9090a0" },
  { key: "c4xx", label: "4xx", hint: "erro do cliente", color: "#ec835a" },
  { key: "c5xx", label: "5xx", hint: "erro do servidor", color: "#d03b3b" },
] as const;

export type StatusKey = (typeof STATUS_SERIES)[number]["key"];

/** Ordinal de um matiz só: mais lento = mais claro, que sobre preto = mais saliente. */
export const LATENCY_SERIES = [
  { key: "p50", label: "p50", color: "#1c5cab" },
  { key: "p95", label: "p95", color: "#3987e5" },
  { key: "p99", label: "p99", color: "#86b6ef" },
] as const;

export type LatencyKey = (typeof LATENCY_SERIES)[number]["key"];

/** Dois categóricos, slots 1 e 2 do tema padrão. */
export const TRAFFIC_SERIES = [
  { key: "inBps", label: "Entrada", color: "#3987e5" },
  { key: "outBps", label: "Saída", color: "#d95926" },
] as const;

/** Barras: uma série, um matiz. O comprimento é que codifica a magnitude. */
export const BAR_COLOR = "#3987e5";

/* Cromo recessivo: grade e eixos a um passo da superfície. */
export const GRID_COLOR = "rgba(255,255,255,0.07)";
export const AXIS_TEXT = "#9090a0";
