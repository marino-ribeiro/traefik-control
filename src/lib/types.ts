/** Shapes returned by the Traefik REST API (/api/*). */

export type ResourceStatus = "enabled" | "disabled" | "warning" | "error";
export type Protocol = "http" | "tcp" | "udp";

export interface TraefikRouter {
  name: string;
  rule?: string;
  entryPoints?: string[];
  service?: string;
  middlewares?: string[];
  provider?: string;
  status?: ResourceStatus;
  priority?: number;
  tls?: { certResolver?: string; options?: string; passthrough?: boolean };
  error?: string[];
  using?: string[];
}

export interface TraefikServer {
  url?: string;
  address?: string;
  weight?: number;
  preservePath?: boolean;
}

export interface TraefikService {
  name: string;
  provider?: string;
  status?: ResourceStatus;
  type?: string;
  error?: string[];
  /** router names pointing at this service */
  usedBy?: string[];
  serverStatus?: Record<string, string>;
  loadBalancer?: {
    servers?: TraefikServer[];
    passHostHeader?: boolean;
    sticky?: { cookie?: { name?: string; secure?: boolean; httpOnly?: boolean } };
    healthCheck?: { path?: string; interval?: string; timeout?: string };
    /** Nome com @provider, ex.: `firewall-transport@file`. */
    serversTransport?: string;
  };
  weighted?: { services?: { name: string; weight?: number }[] };
  mirroring?: { service?: string; mirrors?: { name: string; percent?: number }[] };
  failover?: { service?: string; fallback?: string };
}

export interface TraefikMiddleware {
  name: string;
  provider?: string;
  status?: ResourceStatus;
  type?: string;
  error?: string[];
  usedBy?: string[];
  [key: string]: unknown;
}

export interface TraefikEntryPoint {
  name: string;
  address: string;
  http?: {
    middlewares?: string[];
    tls?: { certResolver?: string };
    redirections?: { entryPoint?: { to?: string; scheme?: string } };
  };
  transport?: { respondingTimeouts?: Record<string, unknown> };
  asDefault?: boolean;
}

export interface SectionStats {
  total: number;
  warnings: number;
  errors: number;
}

export interface TraefikOverview {
  http?: { routers?: SectionStats; services?: SectionStats; middlewares?: SectionStats };
  tcp?: { routers?: SectionStats; services?: SectionStats; middlewares?: SectionStats };
  udp?: { routers?: SectionStats; services?: SectionStats };
  features?: Record<string, unknown>;
  providers?: string[];
}

export interface TraefikVersion {
  Version?: string;
  Codename?: string;
  startDate?: string;
}

/** Everything the dashboard needs, fetched in one shot. */
export interface TraefikSnapshot {
  overview: TraefikOverview;
  version: TraefikVersion;
  entryPoints: TraefikEntryPoint[];
  routers: Record<Protocol, TraefikRouter[]>;
  services: Record<Protocol, TraefikService[]>;
  middlewares: Record<"http" | "tcp", TraefikMiddleware[]>;
  /** true when the payload came from the built-in mock instead of a live Traefik */
  mock: boolean;
  fetchedAt: string;
}
