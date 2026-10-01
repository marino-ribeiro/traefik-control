import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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

/*
 * Sem UI_SESSION_SECRET, um segredo aleatório por processo — nunca a senha:
 * assinar com ela deixava qualquer cookie vazado servir para testar senhas
 * offline. O custo é que reiniciar o painel desloga todo mundo. Mora no
 * globalThis para que todas as cópias do módulo (o Next pode criar uma por
 * rota) assinem e verifiquem com o mesmo valor.
 */
const secretRef = globalThis as unknown as { __traefikUiSecret?: string };

function secret(): string {
  const configured = process.env.UI_SESSION_SECRET;
  if (configured) return configured;
  return (secretRef.__traefikUiSecret ??= randomBytes(32).toString("hex"));
}

/* ------------------------------------------------- limite de tentativas */

const MAX_FAILURES = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;

const attemptsRef = globalThis as unknown as {
  __traefikUiLogin?: Map<string, { failures: number; resetAt: number }>;
};
const attempts = (attemptsRef.__traefikUiLogin ??= new Map());

/**
 * Chave do cliente. Usa o ÚLTIMO valor de X-Forwarded-For — o que o proxy
 * mais próximo anotou —, porque os anteriores vêm do próprio cliente e
 * trocá-los a cada tentativa furaria o limite.
 */
export function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  const last = xff?.split(",").at(-1)?.trim();
  return last || request.headers.get("x-real-ip") || "local";
}

/** Segundos até liberar, ou 0 se o cliente pode tentar. */
export function loginLockedFor(key: string): number {
  const entry = attempts.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (now >= entry.resetAt) {
    attempts.delete(key);
    return 0;
  }
  return entry.failures >= MAX_FAILURES ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now >= entry.resetAt) {
    attempts.set(key, { failures: 1, resetAt: now + LOCK_WINDOW_MS });
  } else {
    entry.failures += 1;
  }
  /* Teto de memória: sem isto, chaves forjadas encheriam o Map. */
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) if (now >= v.resetAt) attempts.delete(k);
  }
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
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
  /* Compara digests de tamanho fixo: comparar os buffers crus saía cedo
     quando o tamanho diferia, e o tempo revelava o tamanho da senha. */
  const a = createHmac("sha256", "pw").update(candidate).digest();
  const b = createHmac("sha256", "pw").update(expected).digest();
  return timingSafeEqual(a, b);
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
