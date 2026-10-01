import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rejectCrossSite } from "@/lib/request-guard";
import { ConfigError, readBackup, restoreBackup } from "@/lib/config-store";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  const status = err instanceof ConfigError ? err.status : ((err as { status?: number }).status ?? 500);
  const details = err instanceof ConfigError ? err.details : undefined;
  return NextResponse.json({ error: (err as Error).message, ...details }, { status });
}

/** Conteúdo de um backup, para a comparação antes de restaurar. */
export async function GET(request: Request) {
  try {
    await requireAuth();
    const name = new URL(request.url).searchParams.get("name") ?? "";
    return NextResponse.json({ name, raw: await readBackup(name) });
  } catch (err) {
    return fail(err);
  }
}

/** Restaura `name`. `base` = o arquivo que a comparação mostrou como atual. */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  try {
    await requireAuth();
    const { name, base } = (await request.json()) as { name?: unknown; base?: unknown };
    if (typeof name !== "string" || !name) throw new ConfigError("campo 'name' obrigatório");
    if (typeof base !== "string") throw new ConfigError("campo 'base' obrigatório");
    await restoreBackup(name, base);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
