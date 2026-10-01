import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { rejectCrossSite } from "@/lib/request-guard";

export async function POST(request: Request) {
  /* O botão de sair é um <form> nativo: checa a origem, mas não exige JSON. */
  const blocked = rejectCrossSite(request, { json: false });
  if (blocked) return blocked;
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
