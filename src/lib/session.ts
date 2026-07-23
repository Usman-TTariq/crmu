import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile, SessionInfo } from "@/lib/types";

// getClaims() verifies the JWT locally (against cached signing keys) instead
// of calling the Supabase auth server on every request like getUser() does.
// On projects still using the legacy shared JWT secret it transparently falls
// back to a server-side check, so it is never less safe — only faster.

/** Deduped per React request — shared by requireAuth + getSession. */
const getAuthClaims = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims;
});

// Lightweight auth check for actions that don't need the caller's profile
// (dashboards, list fetches). Returns the user id.
export const requireAuth = cache(async (): Promise<string> => {
  const claims = await getAuthClaims();
  if (!claims?.sub) throw new Error("Not authenticated.");
  return claims.sub;
});

/** Deduped per React request — layout + page share one session lookup. */
export const getSession = cache(async (): Promise<SessionInfo | null> => {
  const claims = await getAuthClaims();
  if (!claims?.sub) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, title, dept, team, role_key, target, is_active, notes")
    .eq("user_id", claims.sub)
    .single();

  // No linked profile, or the member was deactivated: no usable session.
  if (!profile || profile.is_active === false) return null;

  return {
    userId: claims.sub,
    email: String(claims.email || ""),
    profile: profile as Profile,
  };
});

export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) throw new Error("Not authenticated.");
  return s;
}
