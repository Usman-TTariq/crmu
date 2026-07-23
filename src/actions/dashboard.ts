"use server";

// Dashboard data via Postgres RPC — timeframe travels in the payload.

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/session";
import type { Timeframe } from "@/lib/format";

async function rpc<T>(fn: string, tf: Timeframe): Promise<{ data?: T; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(fn, { tf });
    if (error) return { error: error.message };
    return { data: data as T };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to load." };
  }
}

export async function fetchCeoDashboard(payload: { tf: Timeframe }) {
  return rpc<Record<string, unknown>>("dash_ceo", payload.tf);
}

export async function fetchSalesKpi(payload: { tf: Timeframe }) {
  return rpc<Record<string, unknown>>("dash_sales_kpi", payload.tf);
}

export async function fetchOpsKpi(payload: { tf: Timeframe }) {
  return rpc<Record<string, unknown>>("dash_ops_kpi", payload.tf);
}

export interface BoardCloserRow {
  name: string; a: number; w: number; l: number; vol: number;
  avgd: number | null; rate: number;
}
export interface BoardLeadRow {
  name: string; leads: number; q: number; rej: number; rate: number;
}
export interface BoardTeamRow {
  team: string; leads: number; sqls: number; won: number; lost: number;
}

export async function fetchBoards(payload: { tf: Timeframe }): Promise<{
  closers: BoardCloserRow[];
  leadgen: BoardLeadRow[];
  teams: BoardTeamRow[];
  error?: string;
}> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const [c, l, t] = await Promise.all([
      supabase.rpc("board_closers", { tf: payload.tf }),
      supabase.rpc("board_leadgen", { tf: payload.tf }),
      supabase.rpc("board_teams", { tf: payload.tf }),
    ]);
    const error = c.error?.message || l.error?.message || t.error?.message;
    return {
      closers: (c.data as BoardCloserRow[]) || [],
      leadgen: (l.data as BoardLeadRow[]) || [],
      teams: (t.data as BoardTeamRow[]) || [],
      error,
    };
  } catch (e) {
    return { closers: [], leadgen: [], teams: [], error: e instanceof Error ? e.message : "Failed." };
  }
}

// ---------------------------------------------------------------------------
// Onboarding SLA breaches: lead IDs currently in a fatal state (msp_fatal_leads)
// ---------------------------------------------------------------------------
export async function fetchMspFatalLeads(): Promise<{ leadIds: string[]; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("msp_fatal_leads");
    if (error) return { leadIds: [], error: error.message };
    return { leadIds: (data as string[]) || [] };
  } catch (e) {
    return { leadIds: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}

// ---------------------------------------------------------------------------
// Active login sessions (admin-only; enforced again inside the RPC)
// ---------------------------------------------------------------------------
export interface SessionRow {
  user_id: string;
  name: string;
  title: string;
  role_key: string;
  email: string;
  user_agent: string;
  ip: string;
  signed_in_at: string;
  last_seen: string;
  is_current: boolean;
}

export async function fetchActiveSessions(): Promise<{ sessions: SessionRow[]; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dash_sessions");
    if (error) return { sessions: [], error: error.message };
    return { sessions: (data as SessionRow[]) || [] };
  } catch (e) {
    return { sessions: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}

// ---------------------------------------------------------------------------
// Remote sign-out (admin-only; enforced inside the RPCs). Runs with the
// caller's own JWT so their current session is never revoked.
// Note: already-issued access tokens stay valid until they expire (~1h max),
// after which the signed-out device is forced back to the login screen.
// ---------------------------------------------------------------------------
export async function signOutUserEverywhere(payload: { userId: string }): Promise<{ revoked: number; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_logout_user", { target: payload.userId });
    if (error) return { revoked: 0, error: error.message };
    return { revoked: (data as number) || 0 };
  } catch (e) {
    return { revoked: 0, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function signOutEveryone(): Promise<{ revoked: number; error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_logout_all");
    if (error) return { revoked: 0, error: error.message };
    return { revoked: (data as number) || 0 };
  } catch (e) {
    return { revoked: 0, error: e instanceof Error ? e.message : "Failed." };
  }
}

// ---------------------------------------------------------------------------
// Everything the CEO dashboard needs in ONE action: pays the auth check once
// and runs both RPCs in parallel on the server. (Active logins moved to the
// top-navbar dropdown, which fetches its own data.)
// ---------------------------------------------------------------------------
export async function fetchCeoPage(payload: { tf: Timeframe }): Promise<{
  data?: Record<string, unknown>;
  closers: BoardCloserRow[];
  error?: string;
}> {
  const t0 = performance.now();
  try {
    await requireAuth();
    const supabase = await createClient();
    const [d, c] = await Promise.all([
      supabase.rpc("dash_ceo", { tf: payload.tf }),
      supabase.rpc("board_closers", { tf: payload.tf }),
    ]);
    const ms = Math.round(performance.now() - t0);
    if (ms >= 50 || process.env.NODE_ENV !== "production") {
      console.info(`[crm-timing] fetchCeoPage ${ms}ms`, { tf: payload.tf });
    }
    return {
      data: (d.data as Record<string, unknown>) || undefined,
      closers: (c.data as BoardCloserRow[]) || [],
      error: d.error?.message,
    };
  } catch (e) {
    return { closers: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}
