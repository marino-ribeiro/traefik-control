/**
 * Liga o amostrador de métricas no boot do servidor, não na primeira visita.
 * Sem isto, depois de um restart nada é coletado até alguém abrir o painel —
 * e com o histórico em disco (METRICS_HISTORY_FILE) ele ficaria parado no
 * tempo. O estado do amostrador mora no globalThis, então esta cópia do
 * módulo e a das rotas dividem o mesmo anel.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSampler } = await import("./lib/metrics");
    ensureSampler();
  }
}
