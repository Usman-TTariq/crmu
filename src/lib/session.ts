import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile, SessionInfo } from "@/lib/types";

// getClaims() verifies the JWT locally (against cached signing keys) instead
// of calling the Supabase auth server on every request like getUser() does.
// On projects still using the legacy shared JWT secret it transparently falls
// back to a server-side check, so it is never less safe — only faster.

// Lightweight auth check for actions that don't need the caller's profile
// (dashboards, list fetches). Returns the user id.
export async function requireAuth(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) throw new Error("Not authenticated.");
  return data.claims.sub;
}

export async function getSession(): Promise<SessionInfo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", data.claims.sub)
    .single();

  // No linked profile, or the member was deactivated: no usable session.
  if (!profile || profile.is_active === false) return null;

  return {
    userId: data.claims.sub,
    email: String(data.claims.email || ""),
    profile: profile as Profile,
  };
}

export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) throw new Error("Not authenticated.");
  return s;
}
