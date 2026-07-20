"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireSession } from "@/lib/session";

export type DisputeStatus = "open" | "approved" | "disapproved";

export interface DisputeRow {
  id: string;
  lead_id: string;
  opened_by: string;
  team: string;
  reason: string;
  status: DisputeStatus;
  reviewed_by?: string;
  reviewed_at?: string | null;
  review_note?: string;
  created_at: string;
  business_name?: string;
  owner_name?: string;
}

export async function openDispute(payload: {
  leadId: string;
  reason: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dispute_open", {
      p_lead_id: payload.leadId,
      p_reason: payload.reason,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("dispute_open") || msg.includes("does not exist")) {
        return {
          error: "Dispute SQL not applied yet. Run sql/33_qa_disputes.sql in Supabase.",
        };
      }
      return { error: msg };
    }
    const row = data as { id?: string } | null;
    return { id: row?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not open dispute." };
  }
}

export async function reviewDispute(payload: {
  disputeId: string;
  decision: "approved" | "disapproved";
  note?: string;
}): Promise<{ error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { error } = await supabase.rpc("dispute_review", {
      p_dispute_id: payload.disputeId,
      p_decision: payload.decision,
      p_note: payload.note || "",
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("dispute_review") || msg.includes("does not exist")) {
        return {
          error: "Dispute SQL not applied yet. Run sql/33_qa_disputes.sql in Supabase.",
        };
      }
      return { error: msg };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not review dispute." };
  }
}

export async function fetchOpenDisputes(): Promise<{
  rows: DisputeRow[];
  error?: string;
}> {
  try {
    await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dispute_list_open");
    if (error) return { rows: [], error: error.message };
    return { rows: (data as DisputeRow[]) || [] };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e.message : "Failed to load disputes.",
    };
  }
}
