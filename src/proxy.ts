import { NextResponse } from "next/server";

/**
 * Quem pode exibir o painel num <iframe>.
 *
 * Sem isto, qualquer site podia emoldurar o painel — clickjacking numa tela
 * que reescreve o roteamento. O padrão agora é só o próprio painel; para
 * embutir na intranet:  FRAME_ANCESTORS=https://intranet.waser.com.br
 *
 * Fica no proxy (e não em next.config `headers()`) porque o proxy roda no
 * servidor a cada requisição e lê o ambiente do container; o next.config é
 * avaliado no build e congelaria o valor dentro da imagem.
 *
 * Embutir não dispensa login: o painel continua acessível pelo endereço
 * direto. Mesmo domínio registrável (intranet. e traefik.waser.com.br) é o
 * que mantém o cookie de sessão funcionando dentro do iframe.
 */

/* https://host[:porta], com `*.` opcional no host — nada que possa quebrar o header. */
const ORIGIN = /^https?:\/\/(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

function allowedAncestors(): string[] {
  return (process.env.FRAME_ANCESTORS ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => ORIGIN.test(s));
}

export function proxy() {
  const extra = allowedAncestors();
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", `frame-ancestors 'self'${extra.map((o) => ` ${o}`).join("")}`);
  /* Navegadores antigos só entendem X-Frame-Options, que não sabe listar
     origens: com a intranet liberada ele sairia restritivo demais, então
     só vai quando nada além do próprio painel pode emoldurar. */
  if (extra.length === 0) response.headers.set("X-Frame-Options", "SAMEORIGIN");
  return response;
}

export const config = {
  /* Páginas e APIs; arquivos estáticos não precisam do header. */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
