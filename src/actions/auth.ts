"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logActivity, profileByUserId } from "@/lib/activity-log";
import { getSession } from "@/lib/session";

export interface SignInPayload {
  email: string;
  password: string;
}

export async function signIn(payload: SignInPayload): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });
  if (error) return { error: error.message };

  const userId = data.user?.id;
  if (userId) {
    const profile = await profileByUserId(userId);
    if (profile) {
      await logActivity({
        action: "auth.sign_in",
        summary: `Signed in · ${profile.full_name}`,
        actorOverride: {
          userId,
          name: profile.full_name,
          role: profile.role_key,
        },
      });
    }
  }

  redirect("/");
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
