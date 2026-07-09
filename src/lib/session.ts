import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile, SessionInfo } from "@/lib/types";

export async function getSession(): Promise<SessionInfo | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email || "",
    profile: profile as Profile,
  };
}

export async function requireSession(): Promise<SessionInfo> {
  const s = await getSession();
  if (!s) throw new Error("Not authenticated.");
  return s;
}
