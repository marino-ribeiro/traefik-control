import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getJSON, isMockMode } from "@/lib/traefik";
import { mockSnapshot } from "@/lib/mock";

export const dynamic = "force-dynamic";

/**
 * Read-only pass-through to the Traefik API for client-side refreshes, so the
 * browser never needs a route to Traefik itself (nor its credentials).
 */
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }

  const { path } = await params;
  const suffix = path.join("/");

  if (isMockMode()) {
    const body = mockFor(suffix);
    return body === undefined
      ? NextResponse.json({ error: `sem mock para /${suffix}` }, { status: 404 })
      : NextResponse.json(body);
  }

  try {
    return NextResponse.json(await getJSON<unknown>(`/api/${suffix}`));
  } catch (err) {
    const status = (err as { status?: number }).status ?? 502;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

function mockFor(suffix: string): unknown {
  const s = mockSnapshot();
  const table: Record<string, unknown> = {
    overview: s.overview,
    version: s.version,
    entrypoints: s.entryPoints,
    "http/routers": s.routers.http,
    "tcp/routers": s.routers.tcp,
    "udp/routers": s.routers.udp,
    "http/services": s.services.http,
    "tcp/services": s.services.tcp,
    "udp/services": s.services.udp,
    "http/middlewares": s.middlewares.http,
    "tcp/middlewares": s.middlewares.tcp,
  };
  return table[suffix];
}
