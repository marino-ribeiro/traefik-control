import { NextResponse } from "next/server";
import { SESSION_COOKIE, authDisabled, checkPassword, issueToken } from "@/lib/auth";

export async function POST(request: Request) {
  if (authDisabled()) return NextResponse.json({ ok: true, note: "auth desativada" });

  let password = "";
  try {
    ({ password = "" } = (await request.json()) as { password?: string });
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "senha incorreta" }, { status: 401 });
  }

  const { value, maxAge } = issueToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}
