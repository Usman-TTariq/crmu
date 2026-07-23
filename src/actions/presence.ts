"use server";

// Employee presence heartbeats + admin monitor RPCs.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth, getSession } from "@/lib/session";
import { MONITOR_ROLES } from "@/lib/constants";

export type PresenceStatus = "working" | "idle" | "away" | "offline" | "break";
export type BreakType = "general" | "meal";

export interface PresenceRow {
  user_id: string;
  name: string;
  title: string;
  role_key: string;
  team: string;
  dept: string;
  status: PresenceStatus;
  current_tab: string;
  last_heartbeat_at: string | null;
  last_input_at: string | null;
  session_started_at: string | null;
  idle_seconds: number;
  focused: boolean;
  clicks_1m: number;
  keys_1m: number;
  scrolls_1m: number;
  user_agent: string;
  break_type?: string;
  break_started_at?: string | null;
  working_seconds: number;
  idle_seconds_today: number;
  away_seconds: number;
  break_seconds?: number;
  general_break_seconds?: number;
  lunch_break_seconds?: number;
  interactions: number;
  heartbeats: number;
  tabs: Record<string, number>;
  week_working_seconds?: number;
  week_idle_seconds?: number;
  week_away_seconds?: number;
  week_break_seconds?: number;
  week_general_break_seconds?: number;
  week_lunch_break_seconds?: number;
  week_interactions?: number;
  week_start?: string;
  week_end?: string;
}

export interface PresenceEvent {
  id: number;
  status: PresenceStatus;
  prev_status: string | null;
  current_tab: string;
  created_at: string;
}

export interface PresenceDayRow {
  day: string;
  working_seconds: number;
  idle_seconds: number;
  away_seconds: number;
  break_seconds?: number;
  general_break_seconds?: number;
  lunch_break_seconds?: number;
  interactions: number;
  heartbeats: number;
}

export async function sendPresenceHeartbeat(payload: {
  tab: string;
  idleSeconds: number;
  focused: boolean;
  clicks: number;
  keys: number;
  scrolls: number;
  userAgent: string;
}): Promise<{ status?: string; error?: string }> {
  const t0 = performance.now();
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("presence_heartbeat", {
      p_tab: payload.tab,
      p_idle_seconds: payload.idleSeconds,
      p_focused: payload.focused,
      p_clicks: payload.clicks,
      p_keys: payload.keys,
      p_scrolls: payload.scrolls,
      p_user_agent: payload.userAgent,
    });
    if (error) return { error: error.message };
    const row = data as { status?: string } | null;
    const ms = Math.round(performance.now() - t0);
    if (ms >= 50 || process.env.NODE_ENV !== "production") {
      console.info(`[crm-timing] sendPresenceHeartbeat ${ms}ms`);
    }
    return { status: row?.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Heartbeat failed." };
  }
}

export async function markPresenceOffline(): Promise<{ error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { error } = await supabase.rpc("presence_offline");
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Offline mark failed." };
  }
}

export async function fetchMyPresence(): Promise<{
  status?: PresenceStatus;
  breakType?: string;
  breakStartedAt?: string | null;
  error?: string;
}> {
  try {
    const userId = await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_presence")
      .select("status, break_type, break_started_at, last_heartbeat_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { status: "offline", breakType: "" };
    // Declared breaks stay visible even if a heartbeat blip looks "stale".
    if (data.status === "break" && data.break_type) {
      return {
        status: "break",
        breakType: data.break_type,
        breakStartedAt: data.break_started_at,
      };
    }
    const stale =
      !data.last_heartbeat_at ||
      Date.now() - new Date(data.last_heartbeat_at).getTime() > 90_000;
    return {
      status: (stale ? "offline" : data.status) as PresenceStatus,
      breakType: data.break_type || "",
      breakStartedAt: data.break_started_at,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load presence." };
  }
}

export async function startBreak(
  type: BreakType
): Promise<{ status?: string; breakType?: string; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("presence_start_break", {
      p_type: type,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("presence_start_break") || msg.includes("does not exist")) {
        return {
          error:
            "Break SQL not applied yet. Run sql/47–49 (general / break seconds / meal) in Supabase SQL Editor.",
        };
      }
      return { error: msg };
    }
    const row = data as { status?: string; break_type?: string } | null;
    return { status: row?.status, breakType: row?.break_type };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start break." };
  }
}

export async function endBreak(): Promise<{ status?: string; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("presence_end_break");
    if (error) return { error: error.message };
    const row = data as { status?: string } | null;
    return { status: row?.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not end break." };
  }
}

function todayKarachi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekBounds(day: string): { start: string; end: string } {
  const d = new Date(day + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 Sun
  const mondayOffset = (dow + 6) % 7;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Full company board via service role. Viewer-scoped exclusions:
 *  - CEO / Super Admin: see HR + leadership; hide only top admins
 *  - HR: full floor roster; hide top admins and other HR
 */
async function fetchPresenceBoardAdmin(
  day: string,
  opts?: { excludeRoles?: string[] }
): Promise<{ rows: PresenceRow[]; error?: string }> {
  const admin = createAdminClient();
  const { start: weekStart, end: weekEnd } = weekBounds(day);
  const exclude = opts?.excludeRoles?.length
    ? opts.excludeRoles
    : ["ceo", "super_admin", "hr", "hr_monitor"];

  const { data: profiles, error: pErr } = await admin
    .from("profiles")
    .select("user_id, full_name, title, role_key, team, dept")
    .eq("is_active", true)
    .not("user_id", "is", null)
    .not("role_key", "in", `(${exclude.join(",")})`);
  if (pErr) return { rows: [], error: pErr.message };

  const userIds = (profiles || []).map((p) => String(p.user_id));
  if (!userIds.length) return { rows: [] };

  const [presRes, dayRes, weekRes] = await Promise.all([
    admin.from("user_presence").select("*").in("user_id", userIds),
    admin.from("presence_day").select("*").eq("day", day).in("user_id", userIds),
    admin
      .from("presence_day")
      .select(
        "user_id, working_seconds, idle_seconds, away_seconds, break_seconds, general_break_seconds, lunch_break_seconds, interactions"
      )
      .gte("day", weekStart)
      .lte("day", weekEnd)
      .in("user_id", userIds),
  ]);

  const presenceBy = new Map((presRes.data || []).map((r) => [String(r.user_id), r]));
  const dayBy = new Map((dayRes.data || []).map((r) => [String(r.user_id), r]));
  const weekAgg = new Map<
    string,
    {
      week_working_seconds: number;
      week_idle_seconds: number;
      week_away_seconds: number;
      week_break_seconds: number;
      week_general_break_seconds: number;
      week_lunch_break_seconds: number;
      week_interactions: number;
    }
  >();
  for (const d of weekRes.data || []) {
    const id = String(d.user_id);
    const cur = weekAgg.get(id) || {
      week_working_seconds: 0,
      week_idle_seconds: 0,
      week_away_seconds: 0,
      week_break_seconds: 0,
      week_general_break_seconds: 0,
      week_lunch_break_seconds: 0,
      week_interactions: 0,
    };
    cur.week_working_seconds += Number(d.working_seconds || 0);
    cur.week_idle_seconds += Number(d.idle_seconds || 0);
    cur.week_away_seconds += Number(d.away_seconds || 0);
    cur.week_break_seconds += Number(d.break_seconds || 0);
    cur.week_general_break_seconds += Number(d.general_break_seconds || 0);
    cur.week_lunch_break_seconds += Number(d.lunch_break_seconds || 0);
    cur.week_interactions += Number(d.interactions || 0);
    weekAgg.set(id, cur);
  }

  const staleMs = 90_000;
  const now = Date.now();
  const rows: PresenceRow[] = (profiles || []).map((p) => {
    const uid = String(p.user_id);
    const up = presenceBy.get(uid) as Record<string, unknown> | undefined;
    const pd = dayBy.get(uid) as Record<string, unknown> | undefined;
    const wk = weekAgg.get(uid);
    const hb = up?.last_heartbeat_at ? new Date(String(up.last_heartbeat_at)).getTime() : NaN;
    let status: PresenceStatus = "offline";
    if (up && !Number.isNaN(hb) && now - hb <= staleMs) {
      status = (String(up.status || "offline") as PresenceStatus) || "offline";
    }
    return {
      user_id: uid,
      name: String(p.full_name || ""),
      title: String(p.title || ""),
      role_key: String(p.role_key || ""),
      team: String(p.team || ""),
      dept: String(p.dept || ""),
      status,
      current_tab: String(up?.current_tab || ""),
      last_heartbeat_at: up?.last_heartbeat_at ? String(up.last_heartbeat_at) : null,
      last_input_at: up?.last_input_at ? String(up.last_input_at) : null,
      session_started_at: up?.session_started_at ? String(up.session_started_at) : null,
      idle_seconds: Number(up?.idle_seconds || 0),
      focused: !!up?.focused,
      clicks_1m: Number(up?.clicks_1m || 0),
      keys_1m: Number(up?.keys_1m || 0),
      scrolls_1m: Number(up?.scrolls_1m || 0),
      user_agent: String(up?.user_agent || ""),
      break_type: String(up?.break_type || ""),
      break_started_at: up?.break_started_at ? String(up.break_started_at) : null,
      working_seconds: Number(pd?.working_seconds || 0),
      idle_seconds_today: Number(pd?.idle_seconds || 0),
      away_seconds: Number(pd?.away_seconds || 0),
      break_seconds: Number(pd?.break_seconds || 0),
      general_break_seconds: Number(pd?.general_break_seconds || 0),
      lunch_break_seconds: Number(pd?.lunch_break_seconds || 0),
      interactions: Number(pd?.interactions || 0),
      heartbeats: Number(pd?.heartbeats || 0),
      tabs: (pd?.tabs as Record<string, number>) || {},
      week_working_seconds: wk?.week_working_seconds || 0,
      week_idle_seconds: wk?.week_idle_seconds || 0,
      week_away_seconds: wk?.week_away_seconds || 0,
      week_break_seconds: wk?.week_break_seconds || 0,
      week_general_break_seconds: wk?.week_general_break_seconds || 0,
      week_lunch_break_seconds: wk?.week_lunch_break_seconds || 0,
      week_interactions: wk?.week_interactions || 0,
      week_start: weekStart,
      week_end: weekEnd,
    };
  });

  const rank = (s: PresenceStatus) =>
    s === "working" ? 0 : s === "break" ? 1 : s === "idle" ? 2 : s === "away" ? 3 : 4;
  rows.sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
  return { rows };
}

export async function fetchPresenceBoard(payload?: {
  day?: string;
}): Promise<{ rows: PresenceRow[]; error?: string }> {
  try {
    await requireAuth();
    const session = await getSession();
    const role = session?.profile.role_key || "";
    const day = payload?.day || todayKarachi();

    // CEO / Super Admin: full roster including HR + leadership (app path; works before SQL 67).
    if (role === "ceo" || role === "super_admin") {
      return fetchPresenceBoardAdmin(day, { excludeRoles: ["ceo", "super_admin"] });
    }

    // HR / legacy hr_monitor: floor roster (not other HR / top admins).
    if (role === "hr" || role === "hr_monitor") {
      return fetchPresenceBoardAdmin(day, {
        excludeRoles: ["ceo", "super_admin", "hr", "hr_monitor"],
      });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dash_presence", {
      p_day: day,
    });
    if (error) {
      // Fallback if SQL role grant not applied yet but caller is a monitor role.
      if (MONITOR_ROLES.includes(role) && /restricted/i.test(error.message)) {
        return fetchPresenceBoardAdmin(day, {
          excludeRoles: ["ceo", "super_admin", "hr", "hr_monitor"],
        });
      }
      return { rows: [], error: error.message };
    }
    return { rows: (data as PresenceRow[]) || [] };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}

/** Tiny online/away/break counts for the header badge (sql/79). */
export async function fetchPresenceBadgeSummary(): Promise<{
  online: number;
  away: number;
  break: number;
  error?: string;
}> {
  const t0 = performance.now();
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("presence_badge_summary");
    if (error) {
      // Fallback: derive from board if RPC not applied yet
      const board = await fetchPresenceBoard();
      if (board.error) return { online: 0, away: 0, break: 0, error: error.message };
      const rows = board.rows || [];
      return {
        online: rows.filter((r) => r.status === "working").length,
        away: rows.filter((r) => r.status === "away" || r.status === "idle").length,
        break: rows.filter((r) => r.status === "break").length,
      };
    }
    const row = (data || {}) as { online?: number; away?: number; break?: number };
    const ms = Math.round(performance.now() - t0);
    if (ms >= 50 || process.env.NODE_ENV !== "production") {
      console.info(`[crm-timing] fetchPresenceBadgeSummary ${ms}ms`);
    }
    return {
      online: Number(row.online || 0),
      away: Number(row.away || 0),
      break: Number(row.break || 0),
    };
  } catch (e) {
    return {
      online: 0,
      away: 0,
      break: 0,
      error: e instanceof Error ? e.message : "Failed to load presence summary.",
    };
  }
}

export async function fetchPresenceEvents(payload: {
  userId: string;
  day?: string;
}): Promise<{ events: PresenceEvent[]; error?: string }> {
  try {
    await requireAuth();
    const session = await getSession();
    const role = session?.profile.role_key || "";
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dash_presence_events", {
      p_user_id: payload.userId,
      p_day: payload.day || null,
    });
    if (error) {
      if (role === "hr" || role === "hr_monitor" || MONITOR_ROLES.includes(role)) {
        const admin = createAdminClient();
        const day = payload.day || todayKarachi();
        const start = `${day}T00:00:00+05:00`;
        const end = `${day}T23:59:59.999+05:00`;
        const { data: ev, error: e2 } = await admin
          .from("presence_events")
          .select("id, status, prev_status, current_tab, created_at")
          .eq("user_id", payload.userId)
          .gte("created_at", start)
          .lte("created_at", end)
          .order("created_at", { ascending: true });
        if (e2) return { events: [], error: e2.message };
        return { events: (ev as PresenceEvent[]) || [] };
      }
      return { events: [], error: error.message };
    }
    return { events: (data as PresenceEvent[]) || [] };
  } catch (e) {
    return { events: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}

export async function fetchPresenceWeek(payload: {
  userId: string;
  day?: string;
}): Promise<{ days: PresenceDayRow[]; error?: string }> {
  try {
    await requireAuth();
    const session = await getSession();
    const role = session?.profile.role_key || "";
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dash_presence_week", {
      p_user_id: payload.userId,
      p_day: payload.day || null,
    });
    if (error) {
      if (role === "hr" || role === "hr_monitor" || MONITOR_ROLES.includes(role)) {
        const day = payload.day || todayKarachi();
        const { start, end } = weekBounds(day);
        const admin = createAdminClient();
        const { data: rows, error: e2 } = await admin
          .from("presence_day")
          .select(
            "day, working_seconds, idle_seconds, away_seconds, break_seconds, general_break_seconds, lunch_break_seconds, interactions, heartbeats"
          )
          .eq("user_id", payload.userId)
          .gte("day", start)
          .lte("day", end);
        if (e2) return { days: [], error: e2.message };
        const byDay = new Map((rows || []).map((r) => [String(r.day), r]));
        const days: PresenceDayRow[] = [];
        const cursor = new Date(start + "T12:00:00Z");
        const endD = new Date(end + "T12:00:00Z");
        while (cursor <= endD) {
          const key = cursor.toISOString().slice(0, 10);
          const r = byDay.get(key);
          days.push({
            day: key,
            working_seconds: Number(r?.working_seconds || 0),
            idle_seconds: Number(r?.idle_seconds || 0),
            away_seconds: Number(r?.away_seconds || 0),
            break_seconds: Number(r?.break_seconds || 0),
            general_break_seconds: Number(r?.general_break_seconds || 0),
            lunch_break_seconds: Number(r?.lunch_break_seconds || 0),
            interactions: Number(r?.interactions || 0),
            heartbeats: Number(r?.heartbeats || 0),
          });
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return { days };
      }
      return { days: [], error: error.message };
    }
    return { days: (data as PresenceDayRow[]) || [] };
  } catch (e) {
    return { days: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}
