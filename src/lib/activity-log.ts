import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/session";

export type ActivityLogInput = {
  action: string;
  entityTab?: string | null;
  entityId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
  /** Use when current JWT is not the real actor (e.g. Exit View as). */
  actorOverride?: {
    userId: string;
    name: string;
    role: string;
  };
};

/**
 * Persist an activity log row. No-ops for CEO actors.
 * Never throws — logging must not break business actions.
 */
export async function logActivity(input: ActivityLogInput): Promise<void> {
  try {
    let userId: string | null = null;
    let name = "";
    let role = "";

    if (input.actorOverride) {
      userId = input.actorOverride.userId;
      name = input.actorOverride.name;
      role = input.actorOverride.role;
    } else {
      const session = await getSession();
      if (!session) return;
      userId = session.userId;
      name = session.profile.full_name;
      role = session.profile.role_key;
    }

    // Plan: do not log CEO account actions
    if (role === "ceo") return;

    const admin = createAdminClient();
    const { error } = await admin.from("activity_logs").insert({
      actor_user_id: userId,
      actor_name: name,
      actor_role: role,
      action: input.action,
      entity_tab: input.entityTab || null,
      entity_id: input.entityId || null,
      summary: input.summary,
      meta: input.meta || {},
    });
    if (error) {
      console.error("[activity-log]", error.message);
    }
  } catch (e) {
    console.error("[activity-log]", e);
  }
}

/** Resolve a profile by auth user id (for View-as restore / sign-in logging). */
export async function profileByUserId(
  userId: string
): Promise<{ full_name: string; role_key: string } | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("full_name, role_key")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    return { full_name: String(data.full_name), role_key: String(data.role_key) };
  } catch {
    return null;
  }
}
