import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isAlias, isMap, isScalar, isSeq, parse, parseDocument, YAMLMap, type Document } from "yaml";

/**
 * Read/write side of the app: a single YAML file consumed by Traefik's
 * `file` provider with `watch: true`, so a successful write reloads Traefik.
 *
 * As gravações dos formulários editam o arquivo como DOCUMENTO (AST do
 * `yaml`), não como objeto: só o nó da entrada tocada é substituído, e
 * comentários, linhas em branco, aspas, âncoras e a ordem do resto do arquivo
 * sobrevivem. Antes, parse → stringify reescrevia o arquivo inteiro e apagava
 * todo comentário escrito à mão.
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
    /** Dados extras para o cliente (ex.: o conteúdo atual num conflito). */
    readonly details?: Record<string, unknown>,
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

/*
 * Toda gravação é ler → alterar → gravar. Sem fila, duas requisições
 * simultâneas leem a mesma versão e a última a gravar apaga a outra (medido:
 * 20 criações em paralelo, 2 sobreviviam). A fila mora no globalThis porque
 * o Next pode instanciar este módulo uma vez por rota — uma trava por cópia
 * não travaria nada. Vale para um processo só; com réplicas, o arquivo
 * compartilhado precisaria de lock no disco.
 */
const lockRef = globalThis as unknown as { __traefikConfigQueue?: Promise<unknown> };

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = (lockRef.__traefikConfigQueue ?? Promise.resolve()).then(fn, fn);
  lockRef.__traefikConfigQueue = run.catch(() => undefined);
  return run;
}

/** Temp-file + rename, com nome único: gravações nunca dividem o mesmo .tmp. */
async function atomicWrite(contents: string): Promise<void> {
  await fs.mkdir(path.dirname(DYNAMIC_FILE), { recursive: true });
  await snapshotBackup();
  const tmp = `${DYNAMIC_FILE}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, contents, "utf8");
    await fs.rename(tmp, DYNAMIC_FILE);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
}

/*
 * Extensão `.yml.bak`, nunca `.yml`: com `providers.file.directory`, o Traefik
 * lê a pasta RECURSIVAMENTE, inclusive `.backups/` (testado no v3.3.7) — um
 * backup `.yml` virava configuração ativa e ressuscitava routers removidos.
 * Ele só carrega .yml/.yaml/.toml, então `.bak` fica invisível para ele.
 */
const BACKUP_EXT = ".yml.bak";

async function snapshotBackup(): Promise<void> {
  const current = await readConfigRaw();
  if (!current) return;
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  /* Migra backups de versões anteriores do painel, ainda em `.yml`. */
  for (const f of await fs.readdir(BACKUP_DIR)) {
    if (f.endsWith(".yml")) await fs.rename(path.join(BACKUP_DIR, f), path.join(BACKUP_DIR, `${f}.bak`));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  /* Sufixo aleatório: duas gravações no mesmo milissegundo não sobrescrevem
     o backup uma da outra. Continua ordenando por data no sort. */
  await fs.writeFile(
    path.join(BACKUP_DIR, `dynamic-${stamp}-${randomUUID().slice(0, 8)}${BACKUP_EXT}`),
    current,
    "utf8",
  );

  const kept = (await fs.readdir(BACKUP_DIR)).filter((f) => f.endsWith(BACKUP_EXT)).sort();
  for (const stale of kept.slice(0, Math.max(0, kept.length - MAX_BACKUPS))) {
    await fs.rm(path.join(BACKUP_DIR, stale), { force: true });
  }
}

function isEmptyMap(v: unknown): boolean {
  return v != null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0;
}

/*
 * O Traefik recusa o ARQUIVO INTEIRO quando um mapa estrutural está vazio —
 * `middlewares: {}`, `tcp: {}`, `tls: {}` ("cannot be a standalone element"),
 * derrubando todas as rotas do file provider de uma vez (testado no v3.3.7).
 * Isso vale só para os dois níveis de estrutura (seção e tipo); dentro de
 * uma entrada, `{}` é legítimo — `tls: {}` num router liga TLS com padrões.
 */
function emptyStructuralMaps(config: DynamicConfig): string[] {
  const found: string[] = [];
  for (const [section, value] of Object.entries(config)) {
    if (isEmptyMap(value)) {
      found.push(section);
    } else if (value != null && typeof value === "object" && !Array.isArray(value)) {
      for (const [kind, inner] of Object.entries(value)) {
        if (isEmptyMap(inner)) found.push(`${section}.${kind}`);
      }
    }
  }
  return found;
}

/* ------------------------------------------------------- documento YAML */

const NEW_FILE_HEADER =
  "# Gerenciado pelo Traefik Control. Comentários e formatação feitos à mão\n" +
  "# são preservados; só as entradas editadas pelo painel são reescritas.\n";

async function loadDocument(): Promise<{ doc: Document; raw: string; root: YAMLMap }> {
  const raw = await readConfigRaw();
  const doc: Document = parseDocument(raw);
  if (doc.errors.length > 0) {
    throw new ConfigError(`${path.basename(DYNAMIC_FILE)} tem YAML inválido: ${doc.errors[0].message}`, 500);
  }
  if (doc.contents == null) doc.contents = new YAMLMap();
  if (!isMap(doc.contents)) throw new ConfigError("dynamic.yml não contém um mapa YAML na raiz", 500);
  return { doc, raw, root: doc.contents };
}

function keyOf(node: unknown): string {
  return isScalar(node) ? String(node.value) : String(node);
}

/** O mapa em `path`, criando os que faltam (ou `null` se `create` é falso). */
function mapAt(doc: Document, root: YAMLMap, keys: string[], create: boolean): YAMLMap | null {
  let node = root;
  for (const key of keys) {
    let next: unknown = node.get(key, true);
    if (next == null || (isScalar(next) && next.value == null)) {
      /* `routers:` sem nada embaixo é null no YAML — trata como ausente. */
      if (!create) return null;
      next = new YAMLMap();
      node.set(doc.createNode(key), next);
    }
    if (!isMap(next)) throw new ConfigError(`${keys.join(".")} no arquivo não é um mapa`, 500);
    node = next;
  }
  return node;
}

/**
 * Aplica `value` sobre o nó existente mudando só o que mudou: escalares
 * iguais ficam intocados (comentário de linha, aspas, estilo), escalares
 * alterados trocam só o valor (o comentário da linha fica), mapas e listas de
 * mesmo tamanho descem recursivamente e mantêm o estilo flow/block. Só o que
 * não dá para casar — tipo diferente, lista de outro tamanho — é recriado.
 * O resultado é um diff do tamanho da edição, não da entrada inteira.
 */
function mergeInto(doc: Document, node: unknown, value: unknown): unknown {
  /* O formulário só vê o valor resolvido de um alias (`*seguro`): se ele não
     mudou, o alias fica; se mudou, vira valor próprio (a âncora não muda). */
  if (isAlias(node)) {
    const target = node.resolve(doc);
    return target && JSON.stringify(target.toJSON()) === JSON.stringify(value) ? node : doc.createNode(value);
  }
  if (isScalar(node) && (value === null || typeof value !== "object")) {
    if (node.value !== value) node.value = value;
    return node;
  }
  if (isMap(node) && value !== null && typeof value === "object" && !Array.isArray(value)) {
    const next = value as Record<string, unknown>;
    for (const pair of [...node.items]) {
      if (!Object.hasOwn(next, keyOf(pair.key))) node.delete(pair.key);
    }
    for (const [k, v] of Object.entries(next)) {
      const pair = node.items.find((p) => keyOf(p.key) === k);
      if (pair) pair.value = mergeInto(doc, pair.value, v);
      else node.add(doc.createPair(k, v));
    }
    return node;
  }
  if (isSeq(node) && Array.isArray(value) && node.items.length === value.length) {
    node.items = node.items.map((item, i) => mergeInto(doc, item, value[i]));
    return node;
  }
  return doc.createNode(value);
}

/** Remove `{}` nos dois níveis estruturais — ver {@link emptyStructuralMaps}. */
function pruneEmptyStructuralMapsDoc(root: YAMLMap): void {
  for (const pair of [...root.items]) {
    const section = pair.value;
    if (!isMap(section)) continue;
    for (const inner of [...section.items]) {
      if (isMap(inner.value) && inner.value.items.length === 0) section.delete(inner.key);
    }
    if (section.items.length === 0) root.delete(pair.key);
  }
}

/**
 * Estilo do arquivo existente, para a reserialização não reformatá-lo:
 * largura da indentação e se listas ficam recuadas sob a chave (`indentSeq`).
 */
function detectStyle(raw: string): { indent: number; indentSeq: boolean } {
  const lines = raw.split("\n");
  let indent = Infinity;
  let indentSeq: boolean | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const lead = line.length - line.trimStart().length;
    if (lead > 0 && !line.trimStart().startsWith("-")) indent = Math.min(indent, lead);
    if (indentSeq === null && /:\s*$/.test(line)) {
      const next = lines.slice(i + 1).find((l) => l.trim() && !l.trimStart().startsWith("#"));
      if (next?.trimStart().startsWith("- ")) indentSeq = next.length - next.trimStart().length > lead;
    }
  }
  return { indent: Number.isFinite(indent) ? Math.min(Math.max(indent, 2), 8) : 2, indentSeq: indentSeq ?? true };
}

/**
 * Serializa e grava. Callers must already hold the queue ({@link serialized}).
 * Valida o resultado antes do disco: remover uma entrada que é âncora de um
 * alias em outro lugar deixaria o documento quebrado.
 */
async function writeDocument(doc: Document, root: YAMLMap, raw: string): Promise<void> {
  pruneEmptyStructuralMapsDoc(root);
  let out: string;
  try {
    out = doc.toString({ ...detectStyle(raw), lineWidth: 0, flowCollectionPadding: false });
    parse(out);
  } catch (err) {
    throw new ConfigError(
      `a alteração deixaria o YAML inválido (${(err as Error).message}) — ` +
        "verifique se a entrada é âncora (&) usada por um alias (*) em outro ponto do arquivo",
      409,
    );
  }
  await atomicWrite(raw.trim() ? out : NEW_FILE_HEADER + out);
}

/**
 * Replace the file wholesale from raw YAML text, validating before touching
 * disk. `base` é o texto que o editor carregou: se o arquivo mudou desde
 * então (edição por fora, outra aba), recusa com 409 em vez de apagar a
 * mudança alheia sem aviso. Sem `base` (scripts), grava direto.
 */
export async function writeConfigRaw(raw: string, base?: string): Promise<void> {
  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    throw new ConfigError(`YAML inválido: ${(err as Error).message}`);
  }
  if (parsed != null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    throw new ConfigError("a raiz do YAML precisa ser um mapa (http:, tcp:, udp:, tls:)");
  }
  /* No editor bruto o texto é do usuário: recusa em vez de reescrever. */
  const empty = parsed == null ? [] : emptyStructuralMaps(parsed as DynamicConfig);
  if (empty.length > 0) {
    throw new ConfigError(
      `o Traefik recusa o arquivo inteiro com mapa vazio em: ${empty.join(", ")} — ` +
        "remova essas chaves (ou preencha) antes de salvar",
    );
  }
  await serialized(async () => {
    if (base !== undefined) {
      const current = await readConfigRaw();
      if (current !== base) {
        throw new ConfigError(
          "o arquivo mudou no disco desde que você abriu o editor (edição por fora ou em outra aba)",
          409,
          { current },
        );
      }
    }
    await atomicWrite(raw.endsWith("\n") ? raw : `${raw}\n`);
  });
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

/**
 * Cria (sem `rename`) ou edita (`rename` = nome atual) uma entrada. Criar ou
 * renomear para um nome já ocupado é recusado com 409 — antes, sobrescrevia
 * a entrada existente sem aviso.
 *
 * Editar troca só o VALOR do par: a chave fica, e com ela a posição no
 * arquivo e o comentário escrito acima dela. Comentários dentro do valor
 * editado se perdem — o formulário não os conhece.
 */
export function upsertEntry(
  section: Section,
  kind: Kind,
  name: string,
  value: unknown,
  { rename }: { rename?: string } = {},
): Promise<void> {
  return serialized(async () => {
    const key = assertValidName(name);
    const from = rename ? assertValidName(rename) : null;
    const { doc, raw, root } = await loadDocument();
    const target = mapAt(doc, root, [section, kind], true)!;
    const pairOf = (k: string) => target.items.find((p) => keyOf(p.key) === k);

    if (from !== key && pairOf(key)) {
      throw new ConfigError(`já existe "${key}" em ${section}.${kind} — escolha outro nome ou edite o existente`, 409);
    }

    if (from !== null && from !== key) {
      const pair = pairOf(from);
      if (!pair) throw new ConfigError(`"${from}" não existe mais em ${section}.${kind} — recarregue a página`, 404);
      /* Renomeia no lugar: mesma posição, mesmo comentário acima. */
      if (isScalar(pair.key)) pair.key.value = key;
      else pair.key = doc.createNode(key);
      pair.value = mergeInto(doc, pair.value, value);
    } else {
      const pair = pairOf(key);
      if (pair) pair.value = mergeInto(doc, pair.value, value);
      else target.add(doc.createPair(key, value));
    }
    await writeDocument(doc, root, raw);
  });
}

export function deleteEntry(section: Section, kind: Kind, name: string): Promise<void> {
  return serialized(async () => {
    const key = bareName(name);
    const { doc, raw, root } = await loadDocument();
    const target = mapAt(doc, root, [section, kind], false);
    const pair = target?.items.find((p) => keyOf(p.key) === key);
    if (!target || !pair) throw new ConfigError(`"${key}" não existe em ${section}.${kind}`, 404);
    target.delete(pair.key);
    await writeDocument(doc, root, raw);
  });
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
    return (await fs.readdir(BACKUP_DIR))
      .filter((f) => f.endsWith(BACKUP_EXT) || f.endsWith(".yml"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
