"use server";

// User administration — CEO / Super Admin only. Uses the service-role client
// (server-side only) to create auth users and link them to roster profiles.

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { USER_ADMIN_ROLES } from "@/lib/constants";

export interface CreateUserPayload {
  profileId: string;
  email: string;
  password: string;
}

export async function createUserForProfile(payload: CreateUserPayload): Promise<{
  ok?: boolean;
  error?: string;
}> {
  try {
    const session = await requireSession();
    if (!USER_ADMIN_ROLES.includes(session.profile.role_key)) {
      return { error: "Only admins can create users." };
    }
    if (!payload.email || payload.password.length < 8) {
      return { error: "Email required and password must be at least 8 characters." };
    }

    const admin = createAdminClient();

    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("id, user_id, full_name")
      .eq("id", payload.profileId)
      .single();
    if (pErr || !profile) return { error: "Profile not found." };
    if (profile.user_id) return { error: `${profile.full_name} already has a login.` };

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
    });
    if (cErr) return { error: cErr.message };

    const { error: linkErr } = await admin
      .from("profiles")
      .update({ user_id: created.user.id })
      .eq("id", payload.profileId);
    if (linkErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return { error: linkErr.message };
    }

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "User creation failed." };
  }
}
