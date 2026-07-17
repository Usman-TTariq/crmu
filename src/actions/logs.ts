"use server";

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { USER_ADMIN_ROLES } from "@/lib/constants";
import { isDayTimeframe, type Timeframe } from "@/lib/format";

export type ActivityLogRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_tab: string | null;
  entity_id: string | null;
  summary: string;
  meta: Record<string, unknown>;
};

function tfBounds(tf: Timeframe): { start: string; end: string } | null {
  if (tf === "All time") return null;
  if (isDayTimeframe(tf)) return { start: tf, end: tf };
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const end = iso(now);
  if (tf === "Daily") return { start: end, end };
  if (tf === "Weekly") {
    const ws = new Date(now);
    ws.setDate(ws.getDate() - ws.getDay());
    return { start: iso(ws), end };
  }
  if (tf === "Last 7 days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start: iso(start), end };
  }
  const ms = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: iso(ms), end };
}

export async function fetchActivityLogs(payload: {
  page?: number;
  pageSize?: number;
  q?: string;
  tf?: Timeframe;
  action?: string;
}): Promise<{ rows: ActivityLogRow[]; total: number; page: number; pageSize: number; error?: string }> {
  const page = Math.max(1, payload.page || 1);
  const pageSize = Math.min(100, Math.max(8, payload.pageSize || 40));

  try {
    const session = await requireSession();
    if (!USER_ADMIN_ROLES.includes(session.profile.role_key)) {
      return { rows: [], total: 0, page, pageSize, error: "Only CEO / Super Admin can view logs." };
    }

    const supabase = await createClient();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("activity_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    const range = payload.tf ? tfBounds(payload.tf) : null;
    if (range) {
      query = query
        .gte("created_at", `${range.start}T00:00:00`)
        .lte("created_at", `${range.end}T23:59:59.999`);
    }

    const q = (payload.q || "").trim();
    if (q) {
      const safe = q.replace(/[,()%]/g, "");
      if (safe) {
        query = query.or(
          `actor_name.ilike."%${safe}%",summary.ilike."%${safe}%",action.ilike."%${safe}%",entity_id.ilike."%${safe}%"`
        );
      }
    }

    if (payload.action?.trim()) {
      query = query.eq("action", payload.action.trim());
    }

    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error) return { rows: [], total: 0, page, pageSize, error: error.message };

    return {
      rows: (data || []) as ActivityLogRow[],
      total: count ?? 0,
      page,
      pageSize,
    };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize,
      error: e instanceof Error ? e.message : "Failed to load logs.",
    };
  }
}
