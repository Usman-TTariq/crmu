"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireSession } from "@/lib/session";
import { CEO_ROLES } from "@/lib/constants";
import { formatMonitorStamp } from "@/lib/monitor-tz";

const RATE_LIMIT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function reportScreenshotAlert(formData: FormData): Promise<{
  ok?: boolean;
  error?: string;
}> {
  try {
    const session = await requireSession();
    if (CEO_ROLES.includes(session.profile.role_key)) {
      return { error: "Admins are exempt." };
    }

    const file = formData.get("image");
    // Next.js server actions may yield File or Blob depending on runtime.
    if (!(file instanceof Blob) || file.size < 1) {
      return { error: "Image required." };
    }
    if (file.size > MAX_BYTES) {
      return { error: "Image too large." };
    }
    const mime =
      file.type && ALLOWED_TYPES.has(file.type) ? file.type : "image/jpeg";

    const pagePath = String(formData.get("page_path") || "").slice(0, 500);
    const admin = createAdminClient();

    const since = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
    const { data: recent } = await admin
      .from("screenshot_alerts")
      .select("id")
      .eq("actor_user_id", session.userId)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ok: true };
    }

    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const storagePath = `${session.userId}/${Date.now()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await admin.storage
      .from("screenshot_alerts")
      .upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (uploadErr) return { error: uploadErr.message };

    const actorName = session.profile.full_name;
    const actorRole = session.profile.role_key;

    const { data: alertRow, error: insertErr } = await admin
      .from("screenshot_alerts")
      .insert({
        actor_user_id: session.userId,
        actor_name: actorName,
        actor_role: actorRole,
        page_path: pagePath,
        storage_path: storagePath,
      })
      .select("id, created_at")
      .single();
    if (insertErr || !alertRow) {
      await admin.storage.from("screenshot_alerts").remove([storagePath]);
      return { error: insertErr?.message || "Failed to save alert." };
    }

    const { data: admins } = await admin
      .from("profiles")
      .select("full_name")
      .in("role_key", CEO_ROLES)
      .eq("is_active", true);

    const when = formatMonitorStamp(alertRow.created_at);
    const title = "Screenshot detected";
    const body = `${actorName} captured the CRM at ${when}.`;
    const meta = {
      alert_id: alertRow.id,
      storage_path: storagePath,
      actor_name: actorName,
      actor_role: actorRole,
      page_path: pagePath,
    };

    const recipients = (admins || [])
      .map((a) => String(a.full_name || "").trim())
      .filter(Boolean);

    if (recipients.length > 0) {
      const { error: notifyErr } = await admin.from("crm_notifications").insert(
        recipients.map((recipient_name) => ({
          recipient_name,
          kind: "screenshot_alert",
          title,
          body,
          lead_id: "",
          meta,
        }))
      );
      if (notifyErr) return { error: notifyErr.message };
    }

    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to report alert." };
  }
}

export async function getScreenshotAlertSignedUrl(storagePath: string): Promise<{
  url?: string;
  error?: string;
}> {
  try {
    const session = await requireSession();
    if (!CEO_ROLES.includes(session.profile.role_key)) {
      return { error: "Not allowed." };
    }
    const path = String(storagePath || "").trim();
    if (!path || path.includes("..")) return { error: "Invalid path." };

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("screenshot_alerts")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      return { error: error?.message || "Could not create URL." };
    }
    return { url: data.signedUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to sign URL." };
  }
}

export interface ScreenshotAlertRow {
  id: string;
  actor_name: string;
  actor_role: string;
  page_path: string;
  storage_path: string;
  created_at: string;
  preview_url: string | null;
}

export async function listScreenshotAlerts(limit = 24): Promise<{
  rows: ScreenshotAlertRow[];
  error?: string;
}> {
  try {
    const session = await requireSession();
    if (!CEO_ROLES.includes(session.profile.role_key)) {
      return { rows: [], error: "Not allowed." };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("screenshot_alerts")
      .select("id, actor_name, actor_role, page_path, storage_path, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, limit)));

    if (error) return { rows: [], error: error.message };

    // One bulk call for all signed URLs; per-row createSignedUrl was 100
    // sequential round-trips and made the gallery take seconds to open.
    const paths = (data || [])
      .map((r) => String(r.storage_path || ""))
      .filter(Boolean);
    const urlByPath = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await admin.storage
        .from("screenshot_alerts")
        .createSignedUrls(paths, 3600);
      for (const s of signed || []) {
        if (s.path && s.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
      }
    }

    const rows: ScreenshotAlertRow[] = (data || []).map((r) => {
      const path = String(r.storage_path || "");
      return {
        id: r.id,
        actor_name: r.actor_name,
        actor_role: r.actor_role || "",
        page_path: r.page_path || "",
        storage_path: path,
        created_at: r.created_at,
        preview_url: urlByPath.get(path) || null,
      };
    });
    return { rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Failed to load alerts." };
  }
}
