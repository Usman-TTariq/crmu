"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/session";

export async function saveLeadNotes(payload: {
  leadId: string;
  notes: string;
}): Promise<{ error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { error } = await supabase.rpc("lead_notes_update", {
      p_lead_id: payload.leadId,
      p_notes: payload.notes ?? "",
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("lead_notes_update") || msg.includes("does not exist")) {
        return {
          error: "Lead notes SQL not applied yet. Run sql/40_lg_notes_update.sql in Supabase.",
        };
      }
      return { error: msg };
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save notes." };
  }
}
