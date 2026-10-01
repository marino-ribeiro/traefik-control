import type { TraefikEntryPoint, TraefikRouter } from "./types";

/**
 * Endereços que abrem o serviço de um router HTTP no navegador, derivados da
 * regra e dos entrypoints — o mesmo raciocínio que o Traefik faz ao casar a
 * requisição, ao contrário:
 *
 *  - host:   cada `Host(...)` literal vira um link; `HostRegexp` e curingas
 *            não, porque não há um endereço único a abrir.
 *  - scheme: https se o router tem TLS ou se o entrypoint redireciona para
 *            https (o link já aponta para o destino do redirect).
 *  - porta:  a do entrypoint, omitida quando é a padrão do scheme.
 *  - path:   o de um único `Path`/`PathPrefix`, só se a regra não tem `||`
 *            nem negação — senão não dá para saber qual caminho casa.
 */
export function routerLinks(router: TraefikRouter, entryPoints: TraefikEntryPoint[]): string[] {
  const rule = router.rule ?? "";
  const hosts = extractHosts(rule);
  if (hosts.length === 0) return [];

  const { scheme, port } = resolveTarget(router, entryPoints);
  const path = extractPath(rule);
  const portPart = port && port !== DEFAULT_PORT[scheme] ? `:${port}` : "";

  const links: string[] = [];
  for (const host of hosts) {
    try {
      /* URL() normaliza e garante que o resultado é http(s) — o host vem de
         configuração, nunca vira `javascript:` ou similar. */
      const url = new URL(`${scheme}://${host}${portPart}${path}`);
      if (!links.includes(url.href)) links.push(url.href);
    } catch {
      /* host que o URL() recusa simplesmente não vira link */
    }
  }
  return links;
}

const DEFAULT_PORT = { http: "80", https: "443" } as const;
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

/** `Host(`a`)`, e também a sintaxe v2 `Host(`a`, `b`)`. Não casa HostRegexp/HostSNI. */
function extractHosts(rule: string): string[] {
  const hosts: string[] = [];
  for (const call of rule.matchAll(/(!?)\bHost\(([^)]*)\)/g)) {
    if (call[1] === "!") continue;
    for (const arg of call[2].matchAll(/[`"']([^`"']+)[`"']/g)) {
      const host = arg[1].trim().toLowerCase();
      if (HOSTNAME.test(host) && !hosts.includes(host)) hosts.push(host);
    }
  }
  return hosts;
}

function extractPath(rule: string): string {
  if (rule.includes("||")) return "";
  const calls = [...rule.matchAll(/(!?)\b(Path|PathPrefix)\(\s*[`"']([^`"']+)[`"']\s*\)/g)];
  if (calls.length !== 1 || calls[0][1] === "!") return "";
  const path = calls[0][3];
  /* `{id:[0-9]+}` e afins são padrões, não caminhos que dê para abrir. */
  return path.startsWith("/") && !/[{}*]/.test(path) ? path : "";
}

function resolveTarget(
  router: TraefikRouter,
  entryPoints: TraefikEntryPoint[],
): { scheme: "http" | "https"; port: string | null } {
  const byName = new Map(entryPoints.map((e) => [e.name, e]));
  /* Sem entryPoints na regra o Traefik usa os padrões (asDefault), ou todos. */
  const declared = (router.entryPoints ?? []).map((n) => byName.get(n)).filter((e) => e !== undefined);
  const candidates = declared.length
    ? declared
    : entryPoints.filter((e) => e.asDefault).length
      ? entryPoints.filter((e) => e.asDefault)
      : entryPoints.filter((e) => e.name !== "traefik");
  if (router.tls) {
    /* Router TLS em vários entrypoints (ou em todos, sem declarar): só
       atende onde há TLS. Um entrypoint que redireciona nunca serve conteúdo,
       então fica de fora; entre os restantes, o que tem TLS ou a 443. */
    const serving = candidates.filter((e) => !e.http?.redirections?.entryPoint?.to);
    const pool = serving.length ? serving : candidates;
    const ep = pool.find((e) => e.http?.tls || portOf(e) === "443") ?? pool[0];
    return { scheme: "https", port: portOf(ep) };
  }

  const ep = candidates[0];
  if (ep?.http?.tls) return { scheme: "https", port: portOf(ep) };

  const redirect = ep?.http?.redirections?.entryPoint;
  if (redirect?.to) {
    const scheme = redirect.scheme === "http" ? "http" : "https";
    /* `to` aceita nome de entrypoint ou só a porta (":443"). */
    const literal = redirect.to.match(/^:?(\d+)$/);
    const target = byName.get(redirect.to);
    return { scheme, port: literal ? literal[1] : target ? portOf(target) : null };
  }
  return { scheme: "http", port: portOf(ep) };
}

/** ":443", "0.0.0.0:443", "[::]:443/tcp" → "443". */
function portOf(ep: TraefikEntryPoint | undefined): string | null {
  const m = ep?.address?.match(/:(\d+)(?:\/\w+)?$/);
  return m ? m[1] : null;
}
