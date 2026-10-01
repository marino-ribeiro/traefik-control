import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authDisabled,
  checkPassword,
  clearLoginFailures,
  clientKey,
  issueToken,
  loginLockedFor,
  recordLoginFailure,
} from "@/lib/auth";
import { rejectCrossSite } from "@/lib/request-guard";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (authDisabled()) return NextResponse.json({ ok: true, note: "auth desativada" });

  const key = clientKey(request);
  const lockedFor = loginLockedFor(key);
  if (lockedFor > 0) {
    return NextResponse.json(
      { error: `muitas tentativas — tente de novo em ${Math.ceil(lockedFor / 60)} min` },
      { status: 429, headers: { "Retry-After": String(lockedFor) } },
    );
  }

  let password = "";
  try {
    ({ password = "" } = (await request.json()) as { password?: string });
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  if (typeof password !== "string" || !checkPassword(password)) {
    recordLoginFailure(key);
    return NextResponse.json({ error: "senha incorreta" }, { status: 401 });
  }

  clearLoginFailures(key);
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
