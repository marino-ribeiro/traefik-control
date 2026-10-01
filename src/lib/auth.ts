import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Deliberately small: one shared password, one signed cookie. This UI can
 * rewrite Traefik's routing table, so it should never sit open — but a full
 * identity provider is out of scope, so put it behind your own SSO if you
 * need real accounts.
 */

export const SESSION_COOKIE = "traefik_ui_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;

function password(): string | null {
  const p = process.env.UI_PASSWORD;
  return p && p.length > 0 ? p : null;
}

function secret(): string {
  return process.env.UI_SESSION_SECRET ?? process.env.UI_PASSWORD ?? "traefik-ui-dev-secret";
}

/** Auth is skipped entirely when no password is configured (dev convenience). */
export function authDisabled(): boolean {
  return password() === null;
}

function sign(expiresAt: number): string {
  const mac = createHmac("sha256", secret()).update(String(expiresAt)).digest("hex");
  return `${expiresAt}.${mac}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expRaw, mac] = token.split(".");
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || !mac) return false;
  if (Date.now() > expiresAt) return false;
  const expected = createHmac("sha256", secret()).update(expRaw).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkPassword(candidate: string): boolean {
  const expected = password();
  if (expected === null) return true;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function issueToken(): { value: string; maxAge: number } {
  return { value: sign(Date.now() + MAX_AGE_SECONDS * 1000), maxAge: MAX_AGE_SECONDS };
}

export async function isAuthenticated(): Promise<boolean> {
  if (authDisabled()) return true;
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

/** Throws a 401-shaped error for route handlers guarding writes. */
export async function requireAuth(): Promise<void> {
  if (!(await isAuthenticated())) {
    const err = new Error("não autenticado") as Error & { status: number };
    err.status = 401;
    throw err;
  }
}
