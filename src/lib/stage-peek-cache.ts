import type { TabKey } from "@/lib/constants";
import type { Rec } from "@/lib/types";
import { fetchRowByLeadId } from "@/actions/data";

export const JOURNEY_PEEK_TABS: TabKey[] = ["leadgen", "closer", "documentation"];

type PeekEntry = { row: Rec | null; error?: string };

const cache = new Map<string, PeekEntry>();
const inflight = new Map<string, Promise<PeekEntry>>();

function key(leadId: string, tab: TabKey) {
  return `${leadId}::${tab}`;
}

export function getStagePeek(leadId: string, tab: TabKey): PeekEntry | null {
  return cache.get(key(leadId, tab)) || null;
}

export function clearStagePeeksForLead(leadId: string) {
  const prefix = `${leadId}::`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
  for (const k of inflight.keys()) {
    if (k.startsWith(prefix)) inflight.delete(k);
  }
}

/** Load one stage; coalesce concurrent requests and memoize the result. */
export function loadStagePeek(leadId: string, tab: TabKey): Promise<PeekEntry> {
  const k = key(leadId, tab);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);

  const pending = inflight.get(k);
  if (pending) return pending;

  const req = fetchRowByLeadId({ tab, leadId, peek: true }).then((res) => {
    const entry: PeekEntry = {
      row: res.row,
      error: res.error || (!res.row ? "not_found" : undefined),
    };
    cache.set(k, entry);
    inflight.delete(k);
    return entry;
  });
  inflight.set(k, req);
  return req;
}

/** Prefetch Lead / Closer / Docs once when the parent lead drawer opens. */
export function prefetchStagePeeks(leadId: string, tabs: TabKey[]): void {
  const id = String(leadId || "").trim();
  if (!id || !tabs.length) return;
  void Promise.all(tabs.map((tab) => loadStagePeek(id, tab)));
}
