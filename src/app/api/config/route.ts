import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { rejectCrossSite } from "@/lib/request-guard";
import { ConfigError, DYNAMIC_FILE, editableNames, listBackups, readConfigRaw, writeConfigRaw } from "@/lib/config-store";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  const status = err instanceof ConfigError ? err.status : ((err as { status?: number }).status ?? 500);
  const details = err instanceof ConfigError ? err.details : undefined;
  return NextResponse.json({ error: (err as Error).message, ...details }, { status });
}

export async function GET() {
  try {
    await requireAuth();
    const [raw, names, backups] = await Promise.all([readConfigRaw(), editableNames(), listBackups()]);
    return NextResponse.json({ path: DYNAMIC_FILE, raw, names, backups });
  } catch (err) {
    return fail(err);
  }
}

/** Replace the whole dynamic file. Validated before anything touches disk. */
export async function PUT(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  try {
    await requireAuth();
    const { raw, base } = (await request.json()) as { raw?: string; base?: unknown };
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "campo 'raw' obrigatório" }, { status: 400 });
    }
    if (base !== undefined && typeof base !== "string") {
      return NextResponse.json({ error: "campo 'base' precisa ser texto" }, { status: 400 });
    }
    /* `base`: o texto que o editor abriu — conflito vira 409 com `current`. */
    await writeConfigRaw(raw, base);
    return NextResponse.json({ ok: true, path: DYNAMIC_FILE });
  } catch (err) {
    return fail(err);
  }
}
