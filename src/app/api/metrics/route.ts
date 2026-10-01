import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getDashboard } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  return NextResponse.json(getDashboard());
}
