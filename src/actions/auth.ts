"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { getSession } from "@/lib/session";

export interface SignInPayload {
  email: string;
  password: string;
}

/** Touch Supabase Auth early so TLS is warm before signIn (login page mount). */
export async function warmAuth(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.getSession();
  } catch {
    // ignore — best-effort warm-up only
  }
}

/**
 * Server-side password auth (browser→Supabase often fails with "Failed to fetch"
 * due to CORS / network blocks). Auth only — no profile lookup, no redirect throw.
 * Client navigates after cookies are set. Audit log is AppShell logSignIn.
 */
export async function signIn(
  payload: SignInPayload
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(payload.email || "").trim(),
    password: payload.password,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Fire-and-forget sign-in audit (called once from AppShell after landing). */
export async function logSignIn(): Promise<void> {
  try {
    const session = await getSession();
    if (!session) return;
    await logActivity({
      action: "auth.sign_in",
      summary: `Signed in · ${session.profile.full_name}`,
    });
  } catch {
    // Never break the app for logging.
  }
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  if (session) {
    await logActivity({
      action: "auth.sign_out",
      summary: `Signed out · ${session.profile.full_name}`,
    });
  }

  const supabase = await createClient();
  try {
    await supabase.rpc("presence_offline");
  } catch {
    // Presence SQL may not be applied yet; never block logout.
  }
  await supabase.auth.signOut();
  // Drop View-as restore cookies so a later login is clean.
  const jar = await cookies();
  jar.delete("crm_impersonator_user_id");
  jar.delete("crm_view_as_name");
  redirect("/login");
}
