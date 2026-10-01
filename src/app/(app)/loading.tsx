/**
 * Esqueleto mostrado enquanto a próxima página renderiza no servidor.
 *
 * Todas as páginas do grupo são `force-dynamic`, então sem este arquivo o
 * Next não tem nada para pré-carregar: o clique só troca a tela quando o
 * servidor responde. Com ele, o esqueleto é prefetchado junto com o link e
 * aparece na hora; o header e a nav (do layout) permanecem montados.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="motion-safe:animate-pulse">
      <span className="sr-only">Carregando…</span>

      <div className="mb-10 border-b border-white/8 pb-8" aria-hidden>
        <Bar className="h-3 w-24" />
        <Bar className="mt-4 h-11 w-64 max-w-full" />
        <Bar className="mt-4 h-4 w-[520px] max-w-full" />
      </div>

      <section className="glass overflow-hidden rounded-panel" aria-hidden>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-6 py-4">
          <Bar className="h-9 min-w-[200px] flex-1" />
          <Bar className="h-9 w-56" />
        </div>
        <ul>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-6 border-b border-white/5 px-6 py-4 last:border-0">
              <Bar className="h-4 w-4 shrink-0 rounded-full" />
              <Bar className="h-4 w-48" />
              <Bar className="hidden h-4 flex-1 md:block" />
              <Bar className="h-4 w-20" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`rounded-control bg-white/[0.06] ${className}`} />;
}
