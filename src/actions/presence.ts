"use server";

// Employee presence heartbeats + admin monitor RPCs.

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/session";

export type PresenceStatus = "working" | "idle" | "away" | "offline" | "break";
export type BreakType = "general" | "lunch";

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
            "Break SQL not applied yet. Run sql/47_general_break.sql and sql/48_break_type_seconds.sql in Supabase SQL Editor.",
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

export async function fetchPresenceBoard(payload?: {
  day?: string;
}): Promise<{ rows: PresenceRow[]; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dash_presence", {
      p_day: payload?.day || null,
    });
    if (error) return { rows: [], error: error.message };
    return { rows: (data as PresenceRow[]) || [] };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}

export async function fetchPresenceEvents(payload: {
  userId: string;
  day?: string;
}): Promise<{ events: PresenceEvent[]; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dash_presence_events", {
      p_user_id: payload.userId,
      p_day: payload.day || null,
    });
    if (error) return { events: [], error: error.message };
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
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dash_presence_week", {
      p_user_id: payload.userId,
      p_day: payload.day || null,
    });
    if (error) return { days: [], error: error.message };
    return { days: (data as PresenceDayRow[]) || [] };
  } catch (e) {
    return { days: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}
