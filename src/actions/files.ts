"use server";

// Attachment upload/delete. Binary travels as FormData (payload), metadata in
// the attachments table, files in the private "documents" bucket.

import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { MAX_FILE_BYTES, OK_EXT, extOf } from "@/lib/format";
import type { Attachment } from "@/lib/types";

export async function uploadAttachment(formData: FormData): Promise<{
  attachment?: Attachment;
  error?: string;
}> {
  try {
    const session = await requireSession();
    const supabase = await createClient();

    const file = formData.get("file") as File | null;
    const leadId = String(formData.get("leadId") || "");
    const stage = String(formData.get("stage") || "");

    if (!file || !leadId || !["closer", "ops"].includes(stage)) {
      return { error: "Invalid upload payload." };
    }
    const ext = extOf(file.name);
    if (!OK_EXT.includes(ext)) {
      return { error: `"${file.name}" was skipped: only PDF, JPG, JPEG, PNG, GIF or WEBP are allowed.` };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { error: `"${file.name}" is over the 10 MB limit.` };
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${leadId}/${stage}/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, file, { contentType: file.type || undefined });
    if (upErr) return { error: upErr.message };

    const { data: row, error: insErr } = await supabase
      .from("attachments")
      .insert({
        lead_id: leadId,
        stage,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        file_ext: ext,
        uploaded_by: session.userId,
      })
      .select("*")
      .single();
    if (insErr) {
      await supabase.storage.from("documents").remove([path]);
      return { error: insErr.message };
    }

    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(path, 3600);

    return { attachment: { ...(row as Attachment), signed_url: signed?.signedUrl } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}

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
