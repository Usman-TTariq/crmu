"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireSession } from "@/lib/session";
import type { DisputeRow, DisputeStatus } from "@/actions/disputes";

export type OpsDisputeRow = DisputeRow & { closer?: string };

export async function openOpsDispute(payload: {
  leadId: string;
  reason: string;
}): Promise<{ error?: string; id?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ops_dispute_open", {
      p_lead_id: payload.leadId,
      p_reason: payload.reason,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("ops_dispute_open") || msg.includes("does not exist")) {
        return {
          error: "OPS dispute SQL not applied yet. Run sql/38_ops_disputes.sql in Supabase.",
        };
      }
      return { error: msg };
    }
    const row = data as { id?: string } | null;
    return { id: row?.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not open OPS dispute." };
  }
}

export async function reviewOpsDispute(payload: {
  disputeId: string;
  decision: Exclude<DisputeStatus, "open">;
  note?: string;
}): Promise<{ error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { error } = await supabase.rpc("ops_dispute_review", {
      p_dispute_id: payload.disputeId,
      p_decision: payload.decision,
      p_note: payload.note || "",
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("ops_dispute_review") || msg.includes("does not exist")) {
        return {
          error: "OPS dispute SQL not applied yet. Run sql/38_ops_disputes.sql in Supabase.",
        };
      }
      return { error: msg };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not review OPS dispute." };
  }
}

export async function fetchOpenOpsDisputes(): Promise<{
  rows: OpsDisputeRow[];
  error?: string;
}> {
  try {
    await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ops_dispute_list_open");
    if (error) return { rows: [], error: error.message };
    return { rows: (data as OpsDisputeRow[]) || [] };
  } catch (e) {
    return {
      rows: [],
      error: e instanceof Error ? e.message : "Failed to load OPS disputes.",
    };
  }
}
