import type { Rec } from "@/lib/types";
import type { TabKey } from "@/lib/constants";
import type { Timeframe } from "@/lib/format";

type Entry = { rows: Rec[]; total: number; at: number };

const cache = new Map<string, Entry>();
const TTL_MS = 45_000;

export function pipelineCacheKey(
  tab: TabKey,
  tf: Timeframe,
  page: number,
  pageSize: number,
  q: string,
  extra = ""
): string {
  return `${tab}|${tf}|${page}|${pageSize}|${q}|${extra}`;
}

export function getPipelineCache(key: string): Entry | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setPipelineCache(
  key: string,
  rows: Rec[],
  total: number
): void {
  cache.set(key, { rows, total, at: Date.now() });
}

export function touchPipelineCacheTotal(key: string, total: number): void {
  const hit = cache.get(key);
  if (!hit) return;
  cache.set(key, { ...hit, total, at: Date.now() });
}

export function invalidatePipelineCache(tab?: TabKey): void {
  if (!tab) {
    cache.clear();
    return;
  }
  const prefix = `${tab}|`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
