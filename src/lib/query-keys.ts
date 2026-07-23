import type { TabKey } from "@/lib/constants";
import type { Timeframe } from "@/lib/format";
import type { FetchRowsPayload } from "@/actions/data";

export const PIPELINE_PAGE_SIZE = 50;

export type PipelineListFilters = Omit<
  FetchRowsPayload,
  "tab" | "tf" | "page" | "pageSize" | "q" | "skipCount"
>;

export function pipelineRowsKey(p: {
  tab: TabKey;
  tf: Timeframe;
  page: number;
  pageSize: number;
  q: string;
  filtersKey: string;
}) {
  return [
    "pipeline",
    "rows",
    p.tab,
    p.tf,
    p.page,
    p.pageSize,
    p.q,
    p.filtersKey,
  ] as const;
}

export function pipelineTotalKey(p: {
  tab: TabKey;
  tf: Timeframe;
  q: string;
  filtersKey: string;
}) {
  return ["pipeline", "total", p.tab, p.tf, p.q, p.filtersKey] as const;
}

export function tabCountsKey(tf: Timeframe, tabs: TabKey[]) {
  return ["tabCounts", tf, tabs.join(",")] as const;
}

/** Prefetch / invalidate all list+total queries for one tab. */
export function pipelineTabKey(tab: TabKey) {
  return ["pipeline", tab] as const;
}
