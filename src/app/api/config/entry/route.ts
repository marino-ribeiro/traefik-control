import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ConfigError, deleteEntry, upsertEntry, type Kind, type Section } from "@/lib/config-store";

export const dynamic = "force-dynamic";

const SECTIONS: Section[] = ["http", "tcp", "udp"];
const KINDS: Kind[] = ["routers", "services", "middlewares"];

function fail(err: unknown) {
  const status = err instanceof ConfigError ? err.status : ((err as { status?: number }).status ?? 500);
  return NextResponse.json({ error: (err as Error).message }, { status });
}

function validate(section: unknown, kind: unknown): { section: Section; kind: Kind } {
  if (!SECTIONS.includes(section as Section)) {
    throw new ConfigError(`section inválida: ${String(section)}`);
  }
  if (!KINDS.includes(kind as Kind)) {
    throw new ConfigError(`kind inválido: ${String(kind)}`);
  }
  if (section === "udp" && kind === "middlewares") {
    throw new ConfigError("UDP não suporta middlewares");
  }
  return { section: section as Section, kind: kind as Kind };
}

/** Create or update one entry in the dynamic file. */
export async function POST(request: Request) {
  try {
    await requireAuth();
    const body = (await request.json()) as {
      section?: string;
      kind?: string;
      name?: string;
      rename?: string;
      value?: unknown;
    };
    const { section, kind } = validate(body.section, body.kind);
    if (!body.name) throw new ConfigError("campo 'name' obrigatório");
    if (body.value == null || typeof body.value !== "object") {
      throw new ConfigError("campo 'value' precisa ser um objeto");
    }
    await upsertEntry(section, kind, body.name, body.value, { rename: body.rename });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAuth();
    const url = new URL(request.url);
    const { section, kind } = validate(url.searchParams.get("section"), url.searchParams.get("kind"));
    const name = url.searchParams.get("name");
    if (!name) throw new ConfigError("parâmetro 'name' obrigatório");
    await deleteEntry(section, kind, name);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
