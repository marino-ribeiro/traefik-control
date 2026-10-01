import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ConfigError, bareName, readConfig, type Kind, type Section } from "@/lib/config-store";

export const dynamic = "force-dynamic";

const SECTIONS = new Set(["http", "tcp", "udp"]);
const KINDS = new Set(["routers", "services", "middlewares", "serversTransports"]);

/**
 * Devolve UMA entrada do arquivo dinâmico, já parseada.
 *
 * Existe para o formulário de edição prefilar com o que está escrito no
 * YAML — e não com o estado resolvido da API do Traefik, que traz defaults
 * expandidos e sufixos `@provider` que o usuário nunca digitou.
 */
export async function GET(request: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const section = url.searchParams.get("section") ?? "";
    const kind = url.searchParams.get("kind") ?? "";
    const name = url.searchParams.get("name") ?? "";
    if (!SECTIONS.has(section)) throw new ConfigError(`section inválida: ${section}`);
    if (!KINDS.has(kind)) throw new ConfigError(`kind inválido: ${kind}`);
    if (!name) throw new ConfigError("parâmetro 'name' obrigatório");

    const config = await readConfig();
    const bucket = (config[section as Section] as Record<string, Record<string, unknown>> | undefined)?.[
      kind as Kind
    ];
    const value = bucket?.[bareName(name)];
    if (value === undefined) {
      return NextResponse.json({ error: `"${bareName(name)}" não existe em ${section}.${kind}` }, { status: 404 });
    }
    return NextResponse.json({ value });
  } catch (err) {
    const status = err instanceof ConfigError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
