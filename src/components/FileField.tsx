"use client";

import React, { useRef, useState } from "react";
import { Download, Eye, FileText, Paperclip, X } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { IMG_EXT, MAX_FILE_BYTES, OK_EXT, extOf, fileSizeLabel } from "@/lib/format";
import { deleteAttachment, logAttachmentUpload } from "@/actions/files";
import { createClient } from "@/lib/supabase/client";
import type { Attachment, AttachmentDocType } from "@/lib/types";

const CLOSER_SLOTS: { docType: AttachmentDocType; title: string; required?: boolean }[] = [
  { docType: "driving_license", title: "Driver's License", required: true },
  { docType: "business_license", title: "Business License", required: false },
  { docType: "voided_cheque", title: "Void Cheque", required: true },
  { docType: "bank_statement", title: "Bank Statement" },
  { docType: "proof_of_address", title: "Proof of Address" },
  { docType: "processing_statement", title: "Processing Statement" },
];

const CLOSER_TYPED = new Set(CLOSER_SLOTS.map((s) => s.docType));

function AttachmentRow({
  a,
  readOnly,
  onRemove,
  compact,
}: {
  a: Attachment;
  readOnly: boolean;
  onRemove: (a: Attachment) => void;
  compact?: boolean;
}) {
  const isImg = IMG_EXT.includes(a.file_ext);
  const thumb = compact ? 28 : 42;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: compact ? 7 : 10,
        background: C.lineSoft,
        border: `1px solid ${C.line}`,
        borderRadius: compact ? 8 : 10,
        padding: compact ? "5px 8px" : "8px 10px",
      }}
    >
      <a href={a.signed_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, display: "block" }}>
        {isImg && a.signed_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.signed_url}
            alt={a.file_name}
            style={{
              width: thumb,
              height: thumb,
              objectFit: "cover",
              borderRadius: compact ? 6 : 8,
              border: `1px solid ${C.line}`,
            }}
          />
        ) : (
          <div
            style={{
              width: thumb,
              height: thumb,
              borderRadius: compact ? 6 : 8,
              background: C.blueSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.blueDeep,
            }}
          >
            <FileText size={compact ? 14 : 20} />
          </div>
        )}
      </a>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
            color: C.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {a.file_name}
        </div>
        {!compact ? (
          <div className="mono" style={{ fontSize: 11, color: C.inkSoft }}>
            {a.file_ext.toUpperCase()} &middot; {fileSizeLabel(a.file_size)}
            {a.stage === "closer"
              ? " · from Closer"
              : a.stage === "documentation"
                ? " · from Docs"
                : a.stage === "ops"
                  ? " · OPS"
                  : ""}
          </div>
        ) : null}
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
          type="button"
          onClick={() => onRemove(a)}
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
}

export default function FileField({
  leadId,
  stage,
  list,
  readOnly,
  onChange,
  label,
}: {
  leadId: string;
  stage: "closer" | "ops" | "documentation";
  list: Attachment[];
  readOnly: boolean;
  onChange: (next: Attachment[]) => void;
  label: React.ReactNode;
}) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const slotInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [activeDocType, setActiveDocType] = useState<AttachmentDocType | null>(null);

  const uploadOne = async (
    file: File,
    docType: AttachmentDocType | null,
    replace?: Attachment | null
  ): Promise<{ added?: Attachment; error?: string }> => {
    const ext = extOf(file.name);
    if (!OK_EXT.includes(ext)) {
      return { error: `"${file.name}" was skipped: only PDF, JPG, JPEG, PNG, GIF or WEBP are allowed.` };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { error: `"${file.name}" is ${fileSizeLabel(file.size)}, over the 10 MB limit.` };
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in." };

    if (replace) {
      const del = await deleteAttachment({ id: replace.id, storagePath: replace.storage_path });
      if (del.error) return { error: del.error };
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${leadId}/${stage}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, file, { contentType: file.type || undefined });
    if (upErr) return { error: upErr.message };

    const insertRow: Record<string, unknown> = {
      lead_id: leadId,
      stage,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      file_ext: ext,
      uploaded_by: user.id,
    };
    if (docType) insertRow.doc_type = docType;

    const { data: row, error: insErr } = await supabase
      .from("attachments")
      .insert(insertRow)
      .select("*")
      .single();
    if (insErr) {
      await supabase.storage.from("documents").remove([path]);
      return { error: insErr.message };
    }
    const { data: signed } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    void logAttachmentUpload({ leadId, stage, fileName: file.name });
    return { added: { ...(row as Attachment), signed_url: signed?.signedUrl } };
  };

  const onFiles = async (fl: FileList | null, docType: AttachmentDocType | null = null) => {
    const files = Array.from(fl || []);
    if (!files.length) return;
    setErr("");
    setBusy(true);
    let msg = "";
    const added: Attachment[] = [];
    for (const file of files) {
      const res = await uploadOne(file, docType);
      if (res.error) msg = res.error;
      if (res.added) added.push(res.added);
    }
    if (added.length) onChange([...list, ...added]);
    setErr(msg);
    setBusy(false);
  };

  const onSlotFile = async (docType: AttachmentDocType, fl: FileList | null) => {
    const file = fl?.[0];
    if (!file) return;
    setErr("");
    setBusy(true);
    setActiveDocType(docType);
    const existing = list.find((a) => a.doc_type === docType) || null;
    const res = await uploadOne(file, docType, existing);
    if (res.error) setErr(res.error);
    if (res.added) {
      const without = list.filter((a) => a.id !== existing?.id && a.doc_type !== docType);
      onChange([...without, res.added]);
    } else if (existing && res.error) {
      // keep list if replace failed after delete — refresh parent on next load
    }
    setBusy(false);
    setActiveDocType(null);
  };

  const remove = async (a: Attachment) => {
    const res = await deleteAttachment({ id: a.id, storagePath: a.storage_path });
    if (res.error) setErr(res.error);
    else onChange(list.filter((x) => x.id !== a.id));
  };

  if (stage === "closer") {
    const hasDl = list.some((a) => a.doc_type === "driving_license");
    const hasVoid = list.some((a) => a.doc_type === "voided_cheque");
    const extras = list.filter(
      (a) => !a.doc_type || a.doc_type === "other" || !CLOSER_TYPED.has(a.doc_type as AttachmentDocType)
    );
    const multiBusy = busy && activeDocType === null;

    return (
      <div>
        {label}
        <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 10, fontWeight: 600 }}>
          Required for Docs Received / Closed:{" "}
          <span style={{ color: hasDl ? TONES.good.fg : TONES.bad.fg }}>
            Driving License{hasDl ? " ✓" : " ✗"}
          </span>
          {" · "}
          <span style={{ color: hasVoid ? TONES.good.fg : TONES.bad.fg }}>
            Voided Cheque{hasVoid ? " ✓" : " ✗"}
          </span>
          <span style={{ fontWeight: 500, color: C.inkFaint }}>
            {" "}
            · optional slots + extra files below
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {CLOSER_SLOTS.map((slot) => {
            const file = list.find((a) => a.doc_type === slot.docType);
            const slotBusy = busy && activeDocType === slot.docType;
            return (
              <div key={slot.docType}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
                  {slot.title}
                  {slot.required ? (
                    <span style={{ color: TONES.bad.fg }}> *</span>
                  ) : (
                    <span style={{ color: C.inkFaint, fontWeight: 500 }}> (optional)</span>
                  )}
                </div>
                {file ? (
                  <AttachmentRow a={file} readOnly={readOnly} onRemove={remove} />
                ) : (
                  <div style={{ fontSize: 13, color: C.inkFaint, marginBottom: 6 }}>Not uploaded yet.</div>
                )}
                {!readOnly ? (
                  <div style={{ marginTop: 8 }}>
                    <input
                      ref={(el) => {
                        slotInputRefs.current[slot.docType] = el;
                      }}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,image/*,application/pdf"
                      onChange={(e) => {
                        void onSlotFile(slot.docType, e.target.files);
                        e.target.value = "";
                      }}
                      style={{ display: "none" }}
                    />
                    <button
                      type="button"
                      onClick={() => slotInputRefs.current[slot.docType]?.click()}
                      disabled={busy}
                      style={{
                        border: `1px dashed ${C.blue}`,
                        background: C.blueSoft,
                        color: C.blueDeep,
                        borderRadius: 9,
                        padding: "8px 12px",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: busy ? "default" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        opacity: busy ? 0.7 : 1,
                      }}
                    >
                      <Paperclip size={15} />{" "}
                      {slotBusy ? "Uploading..." : file ? `Replace ${slot.title}` : `Upload ${slot.title}`}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* Extra multi-file uploads — compact so the drawer stays short */}
          <div
            style={{
              borderTop: `1px solid ${C.lineSoft}`,
              paddingTop: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                More files
                {extras.length ? (
                  <span style={{ color: C.inkFaint, fontWeight: 600 }}> ({extras.length})</span>
                ) : null}
              </div>
              {!readOnly ? (
                <>
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,image/*,application/pdf"
                    onChange={(e) => {
                      void onFiles(e.target.files, "other");
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    title="Upload multiple extra documents"
                    style={{
                      border: `1px solid ${C.line}`,
                      background: C.surface,
                      color: C.inkSoft,
                      borderRadius: 8,
                      padding: "5px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: busy ? "default" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      opacity: busy ? 0.7 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Paperclip size={13} />
                    {multiBusy ? "Uploading..." : "Add more files"}
                  </button>
                </>
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: extras.length ? 6 : 0 }}>
              Select many at once · PDF / images · up to 10 MB each
            </div>
            {extras.length ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  maxHeight: 150,
                  overflowY: "auto",
                  paddingRight: 2,
                }}
              >
                {extras.map((a) => (
                  <AttachmentRow key={a.id} a={a} readOnly={readOnly} onRemove={remove} compact />
                ))}
              </div>
            ) : null}
          </div>
        </div>
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

  return (
    <div>
      {label}
      {stage === "ops" && list.some((a) => a.stage !== "ops") ? (
        <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8, fontWeight: 600 }}>
          Closer / Docs files are carried forward (view only). You can attach extra OPS files below.
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 13, color: C.inkFaint }}>No documents attached.</div>
        ) : (
          list.map((a) => (
            <AttachmentRow
              key={a.id}
              a={a}
              readOnly={readOnly || a.stage !== stage}
              onRemove={remove}
            />
          ))
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
              void onFiles(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
          <button
            type="button"
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
