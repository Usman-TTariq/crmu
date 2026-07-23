"use server";

// User administration — CEO / Super Admin only. Uses the service-role client
// (server-side only) to create auth users and link them to roster profiles.

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { USER_ADMIN_ROLES } from "@/lib/constants";
import { logActivity } from "@/lib/activity-log";

export interface CreateUserPayload {
  profileId: string;
  email: string;
  password: string;
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ id: string; email?: string } | null> {
  const want = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = (data.users || []).find((u) => String(u.email || "").toLowerCase() === want);
    if (found) return { id: found.id, email: found.email };
    if ((data.users || []).length < 200) break;
  }
  return null;
}

export async function createUserForProfile(payload: CreateUserPayload): Promise<{
  ok?: boolean;
  error?: string;
}> {
  try {
    if (!payload.email || payload.password.length < 8) {
      return { error: "Email required and password must be at least 8 characters." };
    }

    const admin = createAdminClient();
    const email = payload.email.trim().toLowerCase();
    const [session, profileRes] = await Promise.all([
      requireSession(),
      admin.from("profiles").select("id, user_id, full_name").eq("id", payload.profileId).single(),
    ]);
    if (!USER_ADMIN_ROLES.includes(session.profile.role_key)) {
      return { error: "Only admins can create users." };
    }
    const profile = profileRes.data;
    if (profileRes.error || !profile) return { error: "Profile not found." };
    if (profile.user_id) return { error: `${profile.full_name} already has a login.` };

    let userId: string | null = null;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: payload.password,
      email_confirm: true,
    });

    if (cErr) {
      // Roster was deleted/revoked but Auth user often remains — reclaim orphan.
      const already = /already.*(registered|exists|been used)/i.test(cErr.message);
      if (!already) return { error: cErr.message };

      const existing = await findAuthUserByEmail(admin, email);
      if (!existing) return { error: cErr.message };

      const { data: other } = await admin
        .from("profiles")
        .select("id, full_name")
        .eq("user_id", existing.id)
        .maybeSingle();
      if (other && other.id !== payload.profileId) {
        return {
          error: `Email is already linked to ${other.full_name}. Revoke that login first, or use a different email.`,
        };
      }

      const { error: pwErr } = await admin.auth.admin.updateUserById(existing.id, {
        password: payload.password,
        email_confirm: true,
      });
      if (pwErr) return { error: pwErr.message };
      userId = existing.id;
    } else {
      userId = created.user.id;
    }

    const { error: linkErr } = await admin
      .from("profiles")
      .update({ user_id: userId })
      .eq("id", payload.profileId);
    if (linkErr) {
      // Only delete if we just created a brand-new auth user (not a reclaim).
      if (!cErr && userId) await admin.auth.admin.deleteUser(userId);
      return { error: linkErr.message };
    }

    await logActivity({
      action: "admin.create_login",
      entityTab: "teamsetup",
      entityId: payload.profileId,
      summary: `Created login for ${profile.full_name}`,
      meta: { email, reclaimed: !!cErr },
    });

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "User creation failed." };
  }
}

// ---------------------------------------------------------------------------
// Deactivate / reactivate a roster profile. Deactivated members disappear
// from assignment dropdowns and can no longer sign in (session gate).
// ---------------------------------------------------------------------------
export async function setProfileActive(payload: {
  profileId: string;
  active: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  try {
    const session = await requireSession();
    if (!USER_ADMIN_ROLES.includes(session.profile.role_key)) {
      return { error: "Only admins can change member access." };
    }
    if (payload.profileId === session.profile.id && !payload.active) {
      return { error: "You cannot deactivate your own account." };
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", payload.profileId)
      .maybeSingle();
    const { error } = await admin
      .from("profiles")
      .update({ is_active: payload.active })
      .eq("id", payload.profileId);
    if (error) return { error: error.message };
    await logActivity({
      action: payload.active ? "admin.reactivate" : "admin.deactivate",
      entityTab: "teamsetup",
      entityId: payload.profileId,
      summary: `${payload.active ? "Reactivated" : "Deactivated"} ${profile?.full_name || "member"}`,
    });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Update failed." };
  }
}

// ---------------------------------------------------------------------------
// Set a new password for a member's login. Passwords are stored hashed and
// can never be read back, so admins set a fresh one and share it instead.
// ---------------------------------------------------------------------------
export async function setUserPassword(payload: {
  profileId: string;
  password: string;
}): Promise<{ ok?: boolean; error?: string }> {
  try {
    if (payload.password.length < 8) {
      return { error: "Password must be at least 8 characters." };
    }

    // Session check and target lookup are independent reads — run in parallel
    const admin = createAdminClient();
    const [session, profileRes] = await Promise.all([
      requireSession(),
      admin.from("profiles").select("id, user_id, full_name").eq("id", payload.profileId).single(),
    ]);
    if (!USER_ADMIN_ROLES.includes(session.profile.role_key)) {
      return { error: "Only admins can set passwords." };
    }
    const profile = profileRes.data;
    if (profileRes.error || !profile) return { error: "Profile not found." };
    if (!profile.user_id) return { error: `${profile.full_name} has no login yet.` };

    const { error } = await admin.auth.admin.updateUserById(profile.user_id, {
      password: payload.password,
    });
    if (error) return { error: error.message };
    await logActivity({
      action: "admin.set_password",
      entityTab: "teamsetup",
      entityId: payload.profileId,
      summary: `Set password for ${profile.full_name}`,
    });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Password update failed." };
  }
}

// ---------------------------------------------------------------------------
// Revoke a login: unlink the auth user from the profile and delete the auth
// account (kills all its sessions). The roster profile itself is kept.
// ---------------------------------------------------------------------------
export async function revokeLogin(payload: {
  profileId: string;
}): Promise<{ ok?: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    const [session, profileRes] = await Promise.all([
      requireSession(),
      admin.from("profiles").select("id, user_id, full_name").eq("id", payload.profileId).single(),
    ]);
    if (!USER_ADMIN_ROLES.includes(session.profile.role_key)) {
      return { error: "Only admins can revoke logins." };
    }
    if (payload.profileId === session.profile.id) {
      return { error: "You cannot revoke your own login." };
    }
    const profile = profileRes.data;
    if (profileRes.error || !profile) return { error: "Profile not found." };
    if (!profile.user_id) return { error: `${profile.full_name} has no login to revoke.` };

    const { error: unlinkErr } = await admin
      .from("profiles")
      .update({ user_id: null })
      .eq("id", payload.profileId);
    if (unlinkErr) return { error: unlinkErr.message };

    const { error: delErr } = await admin.auth.admin.deleteUser(profile.user_id);
    if (delErr) return { error: delErr.message };

    await logActivity({
      action: "admin.revoke_login",
      entityTab: "teamsetup",
      entityId: payload.profileId,
      summary: `Revoked login for ${profile.full_name}`,
    });

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Revoke failed." };
  }
}
