export function Footer({ target, mock }: { target: string; mock: boolean }) {
  return (
    <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 px-8 py-8">
      <span className="text-[13px] text-muted">Traefik Control · painel de gerenciamento</span>
      <span className="font-mono text-[12px] text-muted/70">
        {mock ? "modo demonstração — nenhum Traefik conectado" : target}
      </span>
    </footer>
  );
}
