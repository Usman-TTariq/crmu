"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/session";
import { COUNSELLING_LOCKED, COUNSELLING_ROLES } from "@/lib/constants";
import { getSession } from "@/lib/session";
import type { Timeframe } from "@/lib/format";

export interface CounsellingRosterRow {
  id: string;
  user_id: string;
  full_name: string;
  title: string;
  team: string;
  role_key: string;
  created_at: string;
  day1: string;
}

export interface CounsellingPersonSummary {
  name: string;
  role_key: string;
  team: string;
  leads: number;
  qa_q: number;
  qa_rej: number;
  wins: number;
  lost: number;
  working_seconds: number;
}

export interface CounsellingTeamSummary {
  tf: string;
  people: number;
  leads: number;
  qa_qualified: number;
  qa_disqualified: number;
  closer_wins: number;
  closer_lost: number;
  working_seconds: number;
  break_seconds: number;
  away_seconds: number;
  by_person: CounsellingPersonSummary[];
}

export interface OutputWeek {
  week_start: string;
  leads: number;
  qa_q: number;
  qa_rej: number;
  wins: number;
  lost: number;
}

export interface AttendanceDay {
  day: string;
  working_seconds: number;
  break_seconds: number;
  away_seconds: number;
}

export interface AttendanceMonth {
  month_start: string;
  working_seconds: number;
  break_seconds: number;
  away_seconds: number;
}

export type CounsellingWorkKind =
  | "leads"
  | "qa"
  | "closer"
  | "docs"
  | "ops"
  | "onboard"
  | "cs";

export interface CounsellingPersonJourney {
  id: string;
  user_id: string;
  full_name: string;
  title: string;
  team: string;
  role_key: string;
  day1: string;
  today: string;
  tenure_days: number;
  totals: {
    leads: number;
    qa_qualified: number;
    qa_disqualified: number;
    qa_decided?: number;
    closer_assigned: number;
    closer_wins: number;
    closer_lost: number;
    docs_reviewed?: number;
    ops_decided?: number;
    onboard_handled?: number;
    cs_cases?: number;
    working_seconds: number;
    break_seconds: number;
    away_seconds: number;
  };
  output_weeks: OutputWeek[];
  attendance_days: AttendanceDay[];
  attendance_months: AttendanceMonth[];
}

export type CounsellingWorkItem = Record<string, unknown> & {
  lead_id: string;
  business_name?: string;
};

const SQL_HINT =
  "Performance Overview SQL not applied yet. Run sql/39_stats_counselling.sql (and sql/41_counselling_person_leads.sql for lead details) in Supabase.";

function sqlMissing(msg: string): boolean {
  return (
    msg.includes("counselling_") ||
    msg.includes("does not exist") ||
    msg.includes("Could not find the function")
  );
}

export interface CounsellingLeadDetail {
  lead_id: string;
  date_created: string;
  created_at: string;
  updated_at?: string;
  lead_gen_agent: string;
  lead_source: string;
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  business_address: string;
  city: string;
  zip_code: string;
  state: string;
  current_processor: string;
  current_device: string;
  current_rate: string;
  monthly_volume: number | null;
  notes: string;
  qa_outcome: string;
  qa_agent: string;
  qa_date: string | null;
  qa_notes: string;
}

async function assertCounsellingAccess(): Promise<void> {
  await requireAuth();
  if (COUNSELLING_LOCKED) {
    throw new Error("Performance Overview is locked for everyone right now.");
  }
  const session = await getSession();
  if (!session || !COUNSELLING_ROLES.includes(session.profile.role_key)) {
    throw new Error("Performance Overview is restricted to CEO / Super Admin / Sales Head.");
  }
}

export async function fetchCounsellingRoster(): Promise<{
  rows: CounsellingRosterRow[];
  error?: string;
}> {
  try {
    await assertCounsellingAccess();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("counselling_roster");
    if (error) {
      return {
        rows: [],
        error: sqlMissing(error.message) ? SQL_HINT : error.message,
      };
    }
    return { rows: (data as CounsellingRosterRow[]) || [] };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e.message : "Failed to load roster.",
    };
  }
}

export async function fetchCounsellingTeamSummary(payload: {
  tf: Timeframe;
}): Promise<{ summary: CounsellingTeamSummary | null; error?: string }> {
  try {
    await assertCounsellingAccess();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("counselling_team_summary", {
      p_tf: payload.tf,
    });
    if (error) {
      return {
        summary: null,
        error: sqlMissing(error.message) ? SQL_HINT : error.message,
      };
    }
    const raw = data as CounsellingTeamSummary;
    return {
      summary: {
        ...raw,
        by_person: Array.isArray(raw?.by_person) ? raw.by_person : [],
      },
    };
  } catch (e) {
    return {
      summary: null,
      error: e instanceof Error ? e.message : "Failed to load team summary.",
    };
  }
}

export async function fetchCounsellingPersonJourney(payload: {
  profileId: string;
}): Promise<{ journey: CounsellingPersonJourney | null; error?: string }> {
  try {
    await assertCounsellingAccess();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("counselling_person_journey", {
      p_profile_id: payload.profileId,
    });
    if (error) {
      return {
        journey: null,
        error: sqlMissing(error.message) ? SQL_HINT : error.message,
      };
    }
    const raw = data as CounsellingPersonJourney;
    return {
      journey: {
        ...raw,
        output_weeks: Array.isArray(raw?.output_weeks) ? raw.output_weeks : [],
        attendance_days: Array.isArray(raw?.attendance_days) ? raw.attendance_days : [],
        attendance_months: Array.isArray(raw?.attendance_months)
          ? raw.attendance_months
          : [],
        totals: {
          leads: 0,
          qa_qualified: 0,
          qa_disqualified: 0,
          qa_decided: 0,
          closer_assigned: 0,
          closer_wins: 0,
          closer_lost: 0,
          docs_reviewed: 0,
          ops_decided: 0,
          onboard_handled: 0,
          cs_cases: 0,
          working_seconds: 0,
          break_seconds: 0,
          away_seconds: 0,
          ...((raw?.totals || {}) as Partial<CounsellingPersonJourney["totals"]>),
        },
      },
    };
  } catch (e) {
    return {
      journey: null,
      error: e instanceof Error ? e.message : "Failed to load person journey.",
    };
  }
}

export async function fetchCounsellingPersonWork(payload: {
  profileId: string;
  kind: CounsellingWorkKind;
}): Promise<{ items: CounsellingWorkItem[]; error?: string }> {
  try {
    await assertCounsellingAccess();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("counselling_person_work", {
      p_profile_id: payload.profileId,
      p_kind: payload.kind,
    });
    if (error) {
      return {
        items: [],
        error: sqlMissing(error.message)
          ? "Person work SQL not applied yet. Run sql/42_counselling_person_work.sql in Supabase."
          : error.message,
      };
    }
    const raw = data as { items?: CounsellingWorkItem[] } | null;
    return { items: Array.isArray(raw?.items) ? raw.items : [] };
  } catch (e) {
    return {
      items: [],
      error: e instanceof Error ? e.message : "Failed to load work details.",
    };
  }
}

/** @deprecated use fetchCounsellingPersonWork({ kind: "leads" }) */
export async function fetchCounsellingPersonLeads(payload: {
  profileId: string;
}): Promise<{ leads: CounsellingLeadDetail[]; error?: string }> {
  const res = await fetchCounsellingPersonWork({
    profileId: payload.profileId,
    kind: "leads",
  });
  return {
    leads: res.items as unknown as CounsellingLeadDetail[],
    error: res.error,
  };
}
