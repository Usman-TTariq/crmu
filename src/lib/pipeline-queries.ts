import {
  fetchRows,
  fetchRowsTotal,
  fetchTabCounts,
  type FetchRowsPayload,
} from "@/actions/data";
import type { TabKey } from "@/lib/constants";
import type { Timeframe } from "@/lib/format";
import { PIPELINE_PAGE_SIZE } from "@/lib/query-keys";

export async function queryPipelineRows(payload: FetchRowsPayload) {
  const res = await fetchRows({ ...payload, skipCount: true });
  if (res.error) throw new Error(res.error);
  return res;
}

export async function queryPipelineTotal(
  payload: Omit<FetchRowsPayload, "page" | "pageSize" | "skipCount">
) {
  const res = await fetchRowsTotal(payload);
  if (res.error) throw new Error(res.error);
  return res;
}

export async function queryTabCounts(tf: Timeframe, tabs: TabKey[]) {
  return fetchTabCounts({ tf, tabs });
}

/** Default first-page list prefetch (empty search/filters). */
export function defaultPipelinePrefetchPayload(
  tab: TabKey,
  tf: Timeframe
): FetchRowsPayload {
  return {
    tab,
    tf,
    page: 1,
    pageSize: PIPELINE_PAGE_SIZE,
    skipCount: true,
  };
}
