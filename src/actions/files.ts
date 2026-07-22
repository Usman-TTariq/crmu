"use server";

// Attachment delete. Uploads go browser → Supabase Storage directly
// (see FileField) so multi‑MB files are not proxied through Next.js.

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { logActivity } from "@/lib/activity-log";

export async function deleteAttachment(payload: { id: string; storagePath: string }): Promise<{
  ok?: boolean;
  error?: string;
}> {
  try {
    await requireSession();
    const supabase = await createClient();
    const { error } = await supabase.from("attachments").delete().eq("id", payload.id);
    if (error) return { error: error.message };
    await supabase.storage.from("documents").remove([payload.storagePath]);
    await logActivity({
      action: "file.delete",
      entityId: payload.id,
      summary: `Deleted attachment`,
      meta: { path: payload.storagePath },
    });
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed." };
  }
}

/** Called from FileField after a successful client-side upload. */
export async function logAttachmentUpload(payload: {
  leadId: string;
  stage: string;
  fileName: string;
}): Promise<{ ok?: boolean }> {
  await logActivity({
    action: "file.upload",
    entityId: payload.leadId,
    entityTab:
      payload.stage === "documentation"
        ? "documentation"
        : payload.stage === "ops"
          ? "ops"
          : payload.stage === "msp"
            ? "msp"
            : "closer",
    summary: `Uploaded ${payload.fileName} · ${payload.leadId}`,
    meta: { stage: payload.stage, fileName: payload.fileName },
  });
  return { ok: true };
}
