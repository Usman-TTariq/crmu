"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireSession } from "@/lib/session";

export interface CrmNotification {
  id: string;
  recipient_name: string;
  kind: string;
  title: string;
  body: string;
  lead_id: string;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export async function fetchMyNotifications(limit = 30): Promise<{
  rows: CrmNotification[];
  error?: string;
}> {
  try {
    await requireAuth();
    const session = await requireSession();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("crm_notifications")
      .select("id, recipient_name, kind, title, body, lead_id, meta, read_at, created_at")
      .eq("recipient_name", session.profile.full_name)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], error: error.message };
    return {
      rows: (data || []).map((r) => ({
        ...r,
        meta: (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>,
      })) as CrmNotification[],
    };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Failed to load notifications." };
  }
}

export async function markNotificationRead(id?: string | null): Promise<{ error?: string }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const { error } = await supabase.rpc("notifications_mark_read", {
      p_id: id ?? null,
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to mark read." };
  }
}
