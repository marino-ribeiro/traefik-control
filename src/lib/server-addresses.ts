import "server-only";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";

/**
 * Endereços da máquina onde o painel roda — os que se usa num apontamento
 * DNS (registro A/AAAA público, ou IP da rede interna). Assume painel e
 * Traefik na mesma máquina, como no docker-compose do projeto.
 *
 *  - público:  SERVER_PUBLIC_IP, ou descoberto perguntando a um serviço
 *              externo (api.ipify.org), com cache; PUBLIC_IP_LOOKUP=0 desliga.
 *  - interno:  SERVER_INTERNAL_IP, ou as interfaces de rede. Dentro de um
 *              container só se enxerga o IP do container, então a resposta
 *              diz isso em vez de fingir que é o da máquina.
 */

export interface AddressEntry {
  address: string;
  /** Interface de onde veio, quando detectado. */
  iface?: string;
}

export interface ServerAddresses {
  public: {
    v4: string | null;
    v6: string | null;
    source: "env" | "lookup" | "disabled" | "failed";
  };
  internal: {
    addresses: AddressEntry[];
    source: "env" | "interfaces";
  };
  /** Painel rodando em container: o IP interno detectado é o do container. */
  inContainer: boolean;
}

const LOOKUP_TTL_MS = 10 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const LOOKUP_TIMEOUT_MS = 3000;

/* Interfaces virtuais que nunca são o endereço da máquina para DNS. */
const VIRTUAL_IFACE = /^(docker|br-|veth|cni|flannel|virbr|lxc|lxd|podman|kube)/;

const cacheRef = globalThis as unknown as {
  __traefikPublicIp?: { at: number; ttl: number; v4: string | null; v6: string | null };
};

function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => isIP(s) !== 0);
}

/** Um IP só, da família pedida, ou null — nunca o corpo cru da resposta. */
async function lookup(url: string, family: 4 | 6): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return isIP(text) === family ? text : null;
  } catch {
    return null;
  }
}

async function publicAddresses(): Promise<ServerAddresses["public"]> {
  const fixed = parseList(process.env.SERVER_PUBLIC_IP);
  if (fixed.length > 0) {
    return {
      v4: fixed.find((ip) => isIP(ip) === 4) ?? null,
      v6: fixed.find((ip) => isIP(ip) === 6) ?? null,
      source: "env",
    };
  }
  if (process.env.PUBLIC_IP_LOOKUP === "0") return { v4: null, v6: null, source: "disabled" };

  const cached = cacheRef.__traefikPublicIp;
  if (cached && Date.now() - cached.at < cached.ttl) {
    return { v4: cached.v4, v6: cached.v6, source: cached.v4 || cached.v6 ? "lookup" : "failed" };
  }

  /* Endpoints de uma família só: api.ipify.org responde só por IPv4 e
     api6.ipify.org só por IPv6 — sem IPv6 de saída, o segundo falha calado. */
  const [v4, v6] = await Promise.all([
    lookup("https://api.ipify.org", 4),
    lookup("https://api6.ipify.org", 6),
  ]);
  const ok = Boolean(v4 || v6);
  cacheRef.__traefikPublicIp = { at: Date.now(), ttl: ok ? LOOKUP_TTL_MS : FAILURE_TTL_MS, v4, v6 };
  return { v4, v6, source: ok ? "lookup" : "failed" };
}

function internalAddresses(): ServerAddresses["internal"] {
  const fixed = parseList(process.env.SERVER_INTERNAL_IP);
  if (fixed.length > 0) return { addresses: fixed.map((address) => ({ address })), source: "env" };

  const found: AddressEntry[] = [];
  for (const [iface, list] of Object.entries(networkInterfaces())) {
    if (VIRTUAL_IFACE.test(iface)) continue;
    for (const info of list ?? []) {
      if (!info.internal && info.family === "IPv4") found.push({ address: info.address, iface });
    }
  }
  return { addresses: found, source: "interfaces" };
}

function runningInContainer(): boolean {
  return existsSync("/.dockerenv") || existsSync("/run/.containerenv");
}

export async function getServerAddresses(): Promise<ServerAddresses> {
  return {
    public: await publicAddresses(),
    internal: internalAddresses(),
    inContainer: runningInContainer(),
  };
}
