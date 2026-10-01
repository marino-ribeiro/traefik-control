import type { TraefikSnapshot } from "./types";

/**
 * A believable stand-in so the UI is fully explorable without a live Traefik.
 * Deliberately includes a warning and an error router — the states that matter
 * most are the ones you can never reproduce on demand in a healthy cluster.
 */
export function mockSnapshot(): TraefikSnapshot {
  return {
    mock: true,
    fetchedAt: new Date().toISOString(),
    version: { Version: "3.3.4", Codename: "saintnectaire" },
    overview: {
      http: {
        routers: { total: 7, warnings: 1, errors: 1 },
        services: { total: 6, warnings: 0, errors: 1 },
        middlewares: { total: 5, warnings: 0, errors: 0 },
      },
      tcp: {
        routers: { total: 1, warnings: 0, errors: 0 },
        services: { total: 1, warnings: 0, errors: 0 },
        middlewares: { total: 0, warnings: 0, errors: 0 },
      },
      udp: {
        routers: { total: 0, warnings: 0, errors: 0 },
        services: { total: 0, warnings: 0, errors: 0 },
      },
      providers: ["docker", "file", "internal"],
    },
    entryPoints: [
      { name: "web", address: ":80", http: { redirections: { entryPoint: { to: "websecure", scheme: "https" } } } },
      { name: "websecure", address: ":443", asDefault: true, http: { tls: { certResolver: "letsencrypt" } } },
      { name: "postgres", address: ":5432" },
      { name: "traefik", address: ":8080" },
    ],
    routers: {
      http: [
        {
          name: "dashboard@docker",
          rule: "Host(`traefik.marinotech.com.br`)",
          entryPoints: ["websecure"],
          service: "api@internal",
          middlewares: ["auth@file"],
          provider: "docker",
          status: "enabled",
          priority: 100,
          tls: { certResolver: "letsencrypt" },
        },
        {
          name: "grafana@docker",
          rule: "Host(`grafana.marinotech.com.br`)",
          entryPoints: ["websecure"],
          service: "grafana@docker",
          middlewares: ["compress@file", "secure-headers@file"],
          provider: "docker",
          status: "enabled",
          tls: { certResolver: "letsencrypt" },
        },
        {
          name: "glpi@docker",
          rule: "Host(`glpi.marinotech.com.br`) && PathPrefix(`/`)",
          entryPoints: ["websecure"],
          service: "glpi@docker",
          middlewares: ["secure-headers@file"],
          provider: "docker",
          status: "enabled",
          tls: { certResolver: "letsencrypt" },
        },
        {
          name: "gitea@file",
          rule: "Host(`git.marinotech.com.br`)",
          entryPoints: ["websecure"],
          service: "gitea@file",
          provider: "file",
          status: "enabled",
          tls: { certResolver: "letsencrypt" },
        },
        {
          name: "zabbix@file",
          rule: "Host(`zabbix.marinotech.com.br`)",
          entryPoints: ["websecure"],
          service: "zabbix@file",
          middlewares: ["rate-limit@file"],
          provider: "file",
          status: "enabled",
          tls: { certResolver: "letsencrypt" },
        },
        {
          name: "legacy-redirect@file",
          rule: "Host(`old.marinotech.com.br`)",
          entryPoints: ["web"],
          service: "noop@internal",
          provider: "file",
          status: "warning",
          error: ["entrypoint \"web\" redireciona para websecure; regra pode nunca casar"],
        },
        {
          name: "broken-api@docker",
          rule: "Host(`api.marinotech.com.br`)",
          entryPoints: ["websecure"],
          service: "missing-backend@docker",
          provider: "docker",
          status: "error",
          error: ["o service \"missing-backend@docker\" não existe"],
        },
      ],
      tcp: [
        {
          name: "postgres@file",
          rule: "HostSNI(`*`)",
          entryPoints: ["postgres"],
          service: "postgres@file",
          provider: "file",
          status: "enabled",
        },
      ],
      udp: [],
    },
    services: {
      http: [
        {
          name: "api@internal",
          provider: "internal",
          status: "enabled",
          type: "internal",
          usedBy: ["dashboard@docker"],
        },
        {
          name: "grafana@docker",
          provider: "docker",
          status: "enabled",
          type: "loadbalancer",
          usedBy: ["grafana@docker"],
          serverStatus: { "http://172.18.0.4:3000": "UP" },
          loadBalancer: {
            servers: [{ url: "http://172.18.0.4:3000" }],
            passHostHeader: true,
            healthCheck: { path: "/api/health", interval: "10s", timeout: "3s" },
          },
        },
        {
          name: "glpi@docker",
          provider: "docker",
          status: "enabled",
          type: "loadbalancer",
          usedBy: ["glpi@docker"],
          serverStatus: { "http://172.18.0.7:80": "UP", "http://172.18.0.8:80": "UP" },
          loadBalancer: {
            servers: [{ url: "http://172.18.0.7:80" }, { url: "http://172.18.0.8:80" }],
            passHostHeader: true,
            sticky: { cookie: { name: "glpi_lb", secure: true, httpOnly: true } },
          },
        },
        {
          name: "gitea@file",
          provider: "file",
          status: "enabled",
          type: "loadbalancer",
          usedBy: ["gitea@file"],
          serverStatus: { "http://10.0.0.21:3000": "UP" },
          loadBalancer: { servers: [{ url: "http://10.0.0.21:3000" }], passHostHeader: true },
        },
        {
          name: "zabbix@file",
          provider: "file",
          status: "enabled",
          type: "loadbalancer",
          usedBy: ["zabbix@file"],
          serverStatus: { "http://10.0.0.30:8080": "UP", "http://10.0.0.31:8080": "DOWN" },
          loadBalancer: {
            servers: [{ url: "http://10.0.0.30:8080" }, { url: "http://10.0.0.31:8080" }],
            healthCheck: { path: "/ping", interval: "15s", timeout: "5s" },
          },
        },
        {
          name: "missing-backend@docker",
          provider: "docker",
          status: "error",
          type: "loadbalancer",
          usedBy: ["broken-api@docker"],
          error: ["nenhum servidor disponível no load balancer"],
          loadBalancer: { servers: [] },
        },
      ],
      tcp: [
        {
          name: "postgres@file",
          provider: "file",
          status: "enabled",
          type: "loadbalancer",
          usedBy: ["postgres@file"],
          loadBalancer: { servers: [{ address: "10.0.0.40:5432" }] },
        },
      ],
      udp: [],
    },
    middlewares: {
      http: [
        { name: "auth@file", provider: "file", status: "enabled", type: "basicauth", usedBy: ["dashboard@docker"] },
        { name: "compress@file", provider: "file", status: "enabled", type: "compress", usedBy: ["grafana@docker"] },
        {
          name: "secure-headers@file",
          provider: "file",
          status: "enabled",
          type: "headers",
          usedBy: ["grafana@docker", "glpi@docker"],
        },
        { name: "rate-limit@file", provider: "file", status: "enabled", type: "ratelimit", usedBy: ["zabbix@file"] },
        { name: "retry@file", provider: "file", status: "enabled", type: "retry", usedBy: [] },
      ],
      tcp: [],
    },
  };
}
