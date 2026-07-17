"use server";

// CEO / Super Admin: temporarily sign in as another roster member, then restore.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { roleByKey, USER_ADMIN_ROLES } from "@/lib/constants";
import { logActivity, profileByUserId } from "@/lib/activity-log";

const COOKIE_IMPERSONATOR = "crm_impersonator_user_id";
const COOKIE_VIEW_AS_NAME = "crm_view_as_name";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 12, // 12h
};

async function sessionFromEmail(email: string): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) return { error: linkErr.message };
  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) return { error: "Failed to create login token." };

  const supabase = await createClient();
  const { error: otpErr } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr) return { error: otpErr.message };
  return {};
}

export async function getViewAsName(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE_VIEW_AS_NAME)?.value || null;
}

export async function startViewAs(payload: {
  profileId: string;
}): Promise<{ error?: string }> {
  try {
    const jar = await cookies();
    if (jar.get(COOKIE_IMPERSONATOR)?.value) {
      return { error: "Already viewing as another user. Exit first." };
    }

    const session = await requireSession();
    if (!USER_ADMIN_ROLES.includes(session.profile.role_key)) {
      return { error: "Only admins can view as another user." };
    }
    if (payload.profileId === session.profile.id) {
      return { error: "You are already signed in as yourself." };
    }

    const admin = createAdminClient();
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("id, user_id, full_name, role_key, is_active")
      .eq("id", payload.profileId)
      .single();
    if (pErr || !profile) return { error: "Profile not found." };
    if (!profile.user_id) return { error: `${profile.full_name} has no login yet.` };
    if (profile.is_active === false) return { error: `${profile.full_name} is inactive.` };

    const { data: authUser, error: uErr } = await admin.auth.admin.getUserById(profile.user_id);
    if (uErr || !authUser.user?.email) {
      return { error: "Could not load that user's login email." };
    }

    jar.set(COOKIE_IMPERSONATOR, session.userId, COOKIE_OPTS);
    jar.set(COOKIE_VIEW_AS_NAME, profile.full_name, {
      ...COOKIE_OPTS,
      httpOnly: false, // readable by client banner if needed
    });

    await logActivity({
      action: "admin.view_as",
      entityTab: "teamsetup",
      entityId: profile.id,
      summary: `View as ${profile.full_name}`,
    });

    const swapped = await sessionFromEmail(authUser.user.email);
    if (swapped.error) {
      jar.delete(COOKIE_IMPERSONATOR);
      jar.delete(COOKIE_VIEW_AS_NAME);
      return { error: swapped.error };
    }

    const home = roleByKey(String(profile.role_key || "")).home;
    redirect(`/${home}`);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "View as failed." };
  }
}

export async function stopViewAs(): Promise<{ error?: string }> {
  try {
    const jar = await cookies();
    const adminUserId = jar.get(COOKIE_IMPERSONATOR)?.value;
    if (!adminUserId) return { error: "Not viewing as another user." };

    const admin = createAdminClient();
    const { data: authUser, error: uErr } = await admin.auth.admin.getUserById(adminUserId);
    if (uErr || !authUser.user?.email) {
      return { error: "Could not restore admin session." };
    }

    const adminProfile = await profileByUserId(adminUserId);
    const viewAsName = jar.get(COOKIE_VIEW_AS_NAME)?.value || "user";

    const restored = await sessionFromEmail(authUser.user.email);
    jar.delete(COOKIE_IMPERSONATOR);
    jar.delete(COOKIE_VIEW_AS_NAME);
    if (restored.error) return { error: restored.error };

    if (adminProfile) {
      await logActivity({
        action: "admin.view_as_exit",
        entityTab: "teamsetup",
        summary: `Exited view as ${viewAsName}`,
        actorOverride: {
          userId: adminUserId,
          name: adminProfile.full_name,
          role: adminProfile.role_key,
        },
      });
    }

    redirect("/teamsetup");
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { error: e instanceof Error ? e.message : "Exit view as failed." };
  }
}
