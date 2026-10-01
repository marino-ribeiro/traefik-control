import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getServerAddresses } from "@/lib/server-addresses";

export const dynamic = "force-dynamic";

/** Endereços do servidor para a Visão geral — rota à parte para a página não esperar o lookup externo. */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  return NextResponse.json(await getServerAddresses());
}
