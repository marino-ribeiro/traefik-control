import "server-only";
import type {
  Protocol,
  TraefikEntryPoint,
  TraefikMiddleware,
  TraefikOverview,
  TraefikRouter,
  TraefikService,
  TraefikSnapshot,
  TraefikVersion,
} from "./types";
import { mockSnapshot } from "./mock";

const BASE = (process.env.TRAEFIK_API_URL ?? "").replace(/\/+$/, "");
const USE_MOCK = process.env.TRAEFIK_MOCK === "1" || BASE === "";

function authHeader(): Record<string, string> {
  const user = process.env.TRAEFIK_API_USER;
  const pass = process.env.TRAEFIK_API_PASSWORD;
  if (!user || !pass) return {};
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return { Authorization: `Basic ${token}` };
}

export class TraefikError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TraefikError";
  }
}

/**
 * GET a single Traefik API path. Traefik answers `null` for empty collections,
 * so callers that expect a list should go through {@link getList}.
 */
export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", ...authHeader() },
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(8000),
    });
  } catch (cause) {
    throw new TraefikError(
      `não consegui falar com o Traefik em ${url}: ${(cause as Error).message}`,
    );
  }
  if (!res.ok) {
    throw new TraefikError(`Traefik respondeu ${res.status} em ${path}`, res.status);
  }
  return (await res.json()) as T;
}

async function getList<T>(path: string): Promise<T[]> {
  const data = await getJSON<T[] | null>(path);
  return Array.isArray(data) ? data : [];
}

/** A failed sub-request degrades to an empty list rather than sinking the page. */
async function softList<T>(path: string): Promise<T[]> {
  try {
    return await getList<T>(path);
  } catch {
    return [];
  }
}

export function isMockMode(): boolean {
  return USE_MOCK;
}

export function apiBaseUrl(): string {
  return BASE;
}

/** Pull the whole picture in parallel — one render, one round of requests. */
export async function fetchSnapshot(): Promise<TraefikSnapshot> {
  if (USE_MOCK) return mockSnapshot();

  const [
    overview,
    version,
    entryPoints,
    httpRouters,
    tcpRouters,
    udpRouters,
    httpServices,
    tcpServices,
    udpServices,
    httpMiddlewares,
    tcpMiddlewares,
  ] = await Promise.all([
    getJSON<TraefikOverview>("/api/overview"),
    getJSON<TraefikVersion>("/api/version").catch(() => ({}) as TraefikVersion),
    softList<TraefikEntryPoint>("/api/entrypoints"),
    softList<TraefikRouter>("/api/http/routers"),
    softList<TraefikRouter>("/api/tcp/routers"),
    softList<TraefikRouter>("/api/udp/routers"),
    softList<TraefikService>("/api/http/services"),
    softList<TraefikService>("/api/tcp/services"),
    softList<TraefikService>("/api/udp/services"),
    softList<TraefikMiddleware>("/api/http/middlewares"),
    softList<TraefikMiddleware>("/api/tcp/middlewares"),
  ]);

  return {
    overview,
    version,
    entryPoints,
    routers: { http: httpRouters, tcp: tcpRouters, udp: udpRouters },
    services: { http: httpServices, tcp: tcpServices, udp: udpServices },
    middlewares: { http: httpMiddlewares, tcp: tcpMiddlewares },
    mock: false,
    fetchedAt: new Date().toISOString(),
  };
}

/** Distinct providers present in a snapshot, for filter chips. */
export function providersOf(snapshot: TraefikSnapshot): string[] {
  const seen = new Set<string>();
  const protocols: Protocol[] = ["http", "tcp", "udp"];
  for (const p of protocols) {
    for (const r of snapshot.routers[p]) if (r.provider) seen.add(r.provider);
    for (const s of snapshot.services[p]) if (s.provider) seen.add(s.provider);
  }
  return [...seen].sort();
}
