import "server-only";
import { cache } from "react";
import { apiBaseUrl, fetchSnapshot, isMockMode } from "./traefik";
import type { TraefikSnapshot } from "./types";

export interface SnapshotResult {
  snapshot: TraefikSnapshot | null;
  error: string | null;
  target: string;
}

/**
 * Request-scoped memo: the layout and the page both need the snapshot, and
 * React's cache() collapses that into a single round of API calls per render.
 * Never throws — an unreachable Traefik is a state the UI must render, not a
 * crash.
 */
export const getSnapshot = cache(async (): Promise<SnapshotResult> => {
  const target = isMockMode() ? "mock://demo" : apiBaseUrl();
  try {
    return { snapshot: await fetchSnapshot(), error: null, target };
  } catch (err) {
    return { snapshot: null, error: (err as Error).message, target };
  }
});
