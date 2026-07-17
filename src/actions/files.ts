"use server";

// Attachment delete. Uploads go browser → Supabase Storage directly
// (see FileField) so multi‑MB files are not proxied through Next.js.

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";

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
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed." };
  }
}
