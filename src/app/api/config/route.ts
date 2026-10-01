import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ConfigError, DYNAMIC_FILE, editableNames, listBackups, readConfigRaw, writeConfigRaw } from "@/lib/config-store";

export const dynamic = "force-dynamic";

function fail(err: unknown) {
  const status = err instanceof ConfigError ? err.status : ((err as { status?: number }).status ?? 500);
  return NextResponse.json({ error: (err as Error).message }, { status });
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
  try {
    await requireAuth();
    const { raw } = (await request.json()) as { raw?: string };
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "campo 'raw' obrigatório" }, { status: 400 });
    }
    await writeConfigRaw(raw);
    return NextResponse.json({ ok: true, path: DYNAMIC_FILE });
  } catch (err) {
    return fail(err);
  }
}
