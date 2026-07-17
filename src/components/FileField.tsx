"use client";

import React, { useRef, useState } from "react";
import { Download, Eye, FileText, Paperclip, X } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { IMG_EXT, MAX_FILE_BYTES, OK_EXT, extOf, fileSizeLabel } from "@/lib/format";
import { deleteAttachment } from "@/actions/files";
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/lib/types";

export default function FileField({
  leadId,
  stage,
  list,
  readOnly,
  onChange,
  label,
}: {
  leadId: string;
  stage: "closer" | "ops";
  list: Attachment[];
  readOnly: boolean;
  onChange: (next: Attachment[]) => void;
  label: React.ReactNode;
}) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (fl: FileList | null) => {
    const files = Array.from(fl || []);
    if (!files.length) return;
    setErr("");
    setBusy(true);
    let msg = "";
    const added: Attachment[] = [];
    // Direct browser → Supabase Storage (no Next.js proxy; much faster for multi‑MB files)
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErr("Not signed in.");
      setBusy(false);
      return;
    }
    for (const file of files) {
      const ext = extOf(file.name);
      if (!OK_EXT.includes(ext)) {
        msg = `"${file.name}" was skipped: only PDF, JPG, JPEG, PNG, GIF or WEBP are allowed.`;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        msg = `"${file.name}" is ${fileSizeLabel(file.size)}, over the 10 MB limit.`;
        continue;
      }
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${leadId}/${stage}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        msg = upErr.message;
        continue;
      }
      const { data: row, error: insErr } = await supabase
        .from("attachments")
        .insert({
          lead_id: leadId,
          stage,
          storage_path: path,
          file_name: file.name,
          file_size: file.size,
          file_ext: ext,
          uploaded_by: user.id,
        })
        .select("*")
        .single();
      if (insErr) {
        await supabase.storage.from("documents").remove([path]);
        msg = insErr.message;
        continue;
      }
      const { data: signed } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
      added.push({ ...(row as Attachment), signed_url: signed?.signedUrl });
    }
    if (added.length) onChange([...list, ...added]);
    setErr(msg);
    setBusy(false);
  };

  const remove = async (a: Attachment) => {
    const res = await deleteAttachment({ id: a.id, storagePath: a.storage_path });
    if (res.error) setErr(res.error);
    else onChange(list.filter((x) => x.id !== a.id));
  };

  return (
    <div>
      {label}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 13, color: C.inkFaint }}>No documents attached.</div>
        ) : (
          list.map((a) => {
            const isImg = IMG_EXT.includes(a.file_ext);
            return (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: C.lineSoft,
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  padding: "8px 10px",
                }}
              >
                <a href={a.signed_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, display: "block" }}>
                  {isImg && a.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.signed_url}
                      alt={a.file_name}
                      style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 8, border: `1px solid ${C.line}` }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 8,
                        background: C.blueSoft,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: C.blueDeep,
                      }}
                    >
                      <FileText size={20} />
                    </div>
                  )}
                </a>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: C.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.file_name}
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: C.inkSoft }}>
                    {a.file_ext.toUpperCase()} &middot; {fileSizeLabel(a.file_size)}
                  </div>
                </div>
                {a.signed_url ? (
                  <a
                    href={a.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    title="View"
                    style={{ color: C.inkSoft, flexShrink: 0, display: "flex", padding: 5 }}
                  >
                    <Eye size={16} />
                  </a>
                ) : null}
                <a
                  href={a.signed_url}
                  download={a.file_name}
                  title="Download"
                  style={{ color: C.inkSoft, flexShrink: 0, display: "flex", padding: 5 }}
                >
                  <Download size={16} />
                </a>
                {!readOnly ? (
                  <button
                    onClick={() => remove(a)}
                    title="Remove"
                    style={{
                      border: "none",
                      background: "transparent",
                      color: TONES.bad.fg,
                      cursor: "pointer",
                      flexShrink: 0,
                      padding: 5,
                      display: "flex",
                    }}
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {!readOnly ? (
        <div style={{ marginTop: 10 }}>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,image/*,application/pdf"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            style={{
              border: `1px dashed ${C.blue}`,
              background: C.blueSoft,
              color: C.blueDeep,
              borderRadius: 9,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <Paperclip size={15} /> {busy ? "Uploading..." : "Attach document"}
          </button>
          <span style={{ fontSize: 11.5, color: C.inkFaint, marginLeft: 10 }}>
            PDF, JPG, JPEG, PNG, GIF, WEBP &middot; up to 10 MB each
          </span>
        </div>
      ) : null}
      {err ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: TONES.bad.fg,
            background: TONES.bad.bg,
            borderRadius: 8,
            padding: "6px 10px",
          }}
        >
          {err}
        </div>
      ) : null}
    </div>
  );
}
