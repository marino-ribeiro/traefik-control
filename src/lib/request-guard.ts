import "server-only";
import { NextResponse } from "next/server";

/**
 * Barreira contra CSRF nas rotas que escrevem.
 *
 * O cookie de sessão é `SameSite=lax`, e "site" é o domínio registrável: um
 * formulário em QUALQUER outro subdomínio do mesmo domínio manda o cookie
 * junto. Duas checagens fecham isso:
 *
 *  1. Origem — `Sec-Fetch-Site` (todo navegador atual envia) precisa ser
 *     `same-origin`; sem ele, cai para comparar `Origin` com o host.
 *  2. JSON — um <form> não consegue enviar `application/json`, e um fetch
 *     cross-origin com esse tipo exige preflight CORS, que não liberamos.
 *
 * Devolve a resposta de erro, ou `null` quando a requisição pode seguir.
 */
export function rejectCrossSite(request: Request, { json = true }: { json?: boolean } = {}): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site !== null) {
    /* "none" = navegação digitada pelo próprio usuário, não vem de página. */
    if (site !== "same-origin" && site !== "none") return forbidden();
  } else {
    const origin = request.headers.get("origin");
    if (origin !== null && !sameHost(origin, request)) return forbidden();
  }

  if (json) {
    const type = request.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("application/json")) {
      return NextResponse.json({ error: "envie o corpo como application/json" }, { status: 415 });
    }
  }
  return null;
}

function sameHost(origin: string, request: Request): boolean {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "requisição de outra origem recusada" }, { status: 403 });
}
