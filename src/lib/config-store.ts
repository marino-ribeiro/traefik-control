import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

/**
 * Read/write side of the app: a single YAML file consumed by Traefik's
 * `file` provider with `watch: true`, so a successful write reloads Traefik.
 */

export const DYNAMIC_FILE = process.env.TRAEFIK_DYNAMIC_FILE
  ? path.resolve(process.env.TRAEFIK_DYNAMIC_FILE)
  : path.resolve(process.cwd(), "data", "dynamic.yml");

const BACKUP_DIR = path.join(path.dirname(DYNAMIC_FILE), ".backups");
const MAX_BACKUPS = 20;

export type Kind = "routers" | "services" | "middlewares";
export type Section = "http" | "tcp" | "udp";

export interface DynamicConfig {
  http?: { routers?: Record<string, unknown>; services?: Record<string, unknown>; middlewares?: Record<string, unknown> };
  tcp?: { routers?: Record<string, unknown>; services?: Record<string, unknown>; middlewares?: Record<string, unknown> };
  udp?: { routers?: Record<string, unknown>; services?: Record<string, unknown> };
  tls?: Record<string, unknown>;
  [key: string]: unknown;
}

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function readConfig(): Promise<DynamicConfig> {
  try {
    const raw = await fs.readFile(DYNAMIC_FILE, "utf8");
    const parsed = parse(raw) as unknown;
    if (parsed == null) return {};
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ConfigError("dynamic.yml não contém um mapa YAML na raiz", 500);
    }
    return parsed as DynamicConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`não consegui ler ${DYNAMIC_FILE}: ${(err as Error).message}`, 500);
  }
}

export async function readConfigRaw(): Promise<string> {
  try {
    return await fs.readFile(DYNAMIC_FILE, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw new ConfigError(`não consegui ler ${DYNAMIC_FILE}: ${(err as Error).message}`, 500);
  }
}

async function snapshotBackup(): Promise<void> {
  const current = await readConfigRaw();
  if (!current) return;
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(path.join(BACKUP_DIR, `dynamic-${stamp}.yml`), current, "utf8");

  const kept = (await fs.readdir(BACKUP_DIR)).filter((f) => f.endsWith(".yml")).sort();
  for (const stale of kept.slice(0, Math.max(0, kept.length - MAX_BACKUPS))) {
    await fs.rm(path.join(BACKUP_DIR, stale), { force: true });
  }
}

/**
 * Write via temp-file + rename so Traefik's watcher never observes a partial
 * document, and keep the previous version around for a rollback.
 */
export async function writeConfig(config: DynamicConfig): Promise<void> {
  const body = stringify(config, { indent: 2, lineWidth: 0 });
  const header =
    "# Gerenciado pelo Traefik Web UI — edições manuais são preservadas,\n" +
    "# mas chaves alteradas pela UI serão reescritas.\n";
  await fs.mkdir(path.dirname(DYNAMIC_FILE), { recursive: true });
  await snapshotBackup();
  const tmp = `${DYNAMIC_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, header + body, "utf8");
  await fs.rename(tmp, DYNAMIC_FILE);
}

/** Replace the file wholesale from raw YAML text, validating before touching disk. */
export async function writeConfigRaw(raw: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new ConfigError(`YAML inválido: ${(err as Error).message}`);
  }
  if (parsed != null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new ConfigError("a raiz do YAML precisa ser um mapa (http:, tcp:, udp:, tls:)");
  }
  await fs.mkdir(path.dirname(DYNAMIC_FILE), { recursive: true });
  await snapshotBackup();
  const tmp = `${DYNAMIC_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, raw.endsWith("\n") ? raw : `${raw}\n`, "utf8");
  await fs.rename(tmp, DYNAMIC_FILE);
}

/** Names carry no provider suffix inside the file itself. */
export function bareName(name: string): string {
  return name.split("@")[0];
}

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

export function assertValidName(name: string): string {
  const bare = bareName(name.trim());
  if (!bare) throw new ConfigError("o nome não pode ficar vazio");
  if (!NAME_RE.test(bare)) {
    throw new ConfigError(`nome inválido "${bare}": use apenas letras, números, ponto, hífen e underscore`);
  }
  return bare;
}

function bucket(config: DynamicConfig, section: Section, kind: Kind): Record<string, unknown> {
  const sec = (config[section] ??= {}) as Record<string, Record<string, unknown>>;
  return (sec[kind] ??= {});
}

export async function upsertEntry(
  section: Section,
  kind: Kind,
  name: string,
  value: unknown,
  { rename }: { rename?: string } = {},
): Promise<DynamicConfig> {
  const config = await readConfig();
  const target = bucket(config, section, kind);
  const key = assertValidName(name);
  if (rename) {
    const from = assertValidName(rename);
    if (from !== key) delete target[from];
  }
  target[key] = value;
  await writeConfig(config);
  return config;
}

export async function deleteEntry(section: Section, kind: Kind, name: string): Promise<DynamicConfig> {
  const config = await readConfig();
  const key = bareName(name);
  const target = bucket(config, section, kind);
  if (!(key in target)) {
    throw new ConfigError(`"${key}" não existe em ${section}.${kind}`, 404);
  }
  delete target[key];
  await writeConfig(config);
  return config;
}

/** Entries defined in our file, so the UI can mark what it is allowed to edit. */
export async function editableNames(): Promise<Record<Section, Record<Kind, string[]>>> {
  const config = await readConfig();
  const pick = (section: Section, kind: Kind) =>
    Object.keys(((config[section] as Record<string, Record<string, unknown>>)?.[kind] ?? {}) as object).sort();
  return {
    http: { routers: pick("http", "routers"), services: pick("http", "services"), middlewares: pick("http", "middlewares") },
    tcp: { routers: pick("tcp", "routers"), services: pick("tcp", "services"), middlewares: pick("tcp", "middlewares") },
    udp: { routers: pick("udp", "routers"), services: pick("udp", "services"), middlewares: [] },
  };
}

export async function listBackups(): Promise<string[]> {
  try {
    return (await fs.readdir(BACKUP_DIR)).filter((f) => f.endsWith(".yml")).sort().reverse();
  } catch {
    return [];
  }
}
