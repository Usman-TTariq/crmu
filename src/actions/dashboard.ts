"use server";

// Dashboard data via Postgres RPC — timeframe travels in the payload.

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import type { Timeframe } from "@/lib/format";

async function rpc<T>(fn: string, tf: Timeframe): Promise<{ data?: T; error?: string }> {
  try {
    await requireSession();
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
    await requireSession();
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
