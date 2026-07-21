"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X, Zap } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import type { FieldDef, OptsCtx } from "@/lib/schemas";
import type { Rec } from "@/lib/types";
import type { TabDef, TabKey } from "@/lib/constants";
import Field from "@/components/Field";
import Journey from "@/components/Journey";
import { defaultZipForCity, normalizeStateCode } from "@/lib/us-locations";

function withNormalizedState(rec: Rec): Rec {
  if (!rec.state) return rec;
  const code = normalizeStateCode(rec.state);
  return code === rec.state ? rec : { ...rec, state: code };
}

export default function Drawer({
  tab,
  fields,
  record,
  isNew,
  opts,
  readOnly,
  manager,
  canDelete,
  viewTabs,
  ownerLock,
  onClose,
  onSave,
  onDelete,
  allowComment,
  onAddComment,
  canDispute,
  disputeKind = "qa",
  onOpenDispute,
  /** Keys that stay editable even when the drawer is otherwise read-only (e.g. LG notes). */
  extraEditableKeys,
  onSaveNotes,
}: {
  tab: TabDef;
  fields: FieldDef[];
  record: Rec;
  isNew: boolean;
  opts: OptsCtx;
  readOnly: boolean;
  manager: boolean;
  canDelete: boolean;
  viewTabs: TabKey[];
  ownerLock?: { field: string; value: string } | null;
  onClose: () => void;
  onSave: (draft: Rec, isNew: boolean) => void;
  onDelete: (rec: Rec) => void;
  /** Pipeline comments: compose even when the rest of the drawer is read-only */
  allowComment?: boolean;
  onAddComment?: (body: string) => Promise<void>;
  /** Show Create dispute when disqualified / OPS-disapproved and no open dispute */
  canDispute?: boolean;
  /** Copy + banners for Lead Gen QA vs OPS disputes */
  disputeKind?: "qa" | "ops";
  onOpenDispute?: (reason: string) => Promise<void>;
  extraEditableKeys?: string[];
  /** Notes-only save when drawer is read-only (Lead Gen → QA). */
  onSaveNotes?: (notes: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Rec>(() => {
    const base = ownerLock ? { ...record, [ownerLock.field]: ownerLock.value } : { ...record };
    return withNormalizedState(base);
  });
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeBusy, setDisputeBusy] = useState(false);
  const isOpsDispute = disputeKind === "ops";
  const disputeStatus = isOpsDispute ? record.ops_dispute_status : record.dispute_status;
  const disputeReasonShown = isOpsDispute ? record.ops_dispute_reason : record.dispute_reason;
  const disputeReviewNote = isOpsDispute
    ? record.ops_dispute_review_note
    : record.dispute_review_note;
  const afterDispute = isOpsDispute
    ? record.returned_after_ops_dispute || record.after_ops_dispute
    : record.returned_after_dispute || record.after_dispute;

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Parent can push fresh comments without remounting / losing the open drawer
  useEffect(() => {
    setDraft((d) => ({
      ...d,
      lead_comments: record.lead_comments ?? d.lead_comments,
      comments: record.comments ?? d.comments,
      ...(record.__newComment === "" ? { __newComment: "" } : null),
    }));
  }, [record.lead_comments, record.comments, record.__newComment]);

  const onChange = (f: { k: string }, v: unknown) =>
    setDraft((d) => {
      if (f.k === "state" && String(d.state || "") !== String(v || "")) {
        return { ...d, state: v, city: "", zip_code: "" };
      }
      if (f.k === "city" && String(d.city || "") !== String(v || "")) {
        return {
          ...d,
          city: v,
          zip_code: defaultZipForCity(d.state, v, d.zip_code),
        };
      }
      return { ...d, [f.k]: v };
    });

  const onPatch = (patch: Record<string, unknown>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const title = String(draft.business_name || draft.full_name || "Record");
  const idtag = String(draft.lead_id || "");
  // Manual additions need the normally read-only carry-over fields editable
  const effFields = fields.map((f) =>
    isNew && f.readOnly && f.k !== "lead_id" ? { ...f, readOnly: false } : f
  );
  const visible = effFields.filter(
    (f) =>
      !(f.k === "lost_reason" && draft.stage !== "Closed Lost") &&
      !(f.k === "fail_reason" && draft.decision !== "Fail") &&
      // Uploads need a lead_id in storage — hide until the record exists
      !(isNew && f.type === "files")
  );
  const fullFields = visible.filter((f) => !f.long && f.type !== "thread" && f.type !== "files");
  const longFields = visible.filter((f) => f.long || f.type === "thread" || f.type === "files");
  const isExtraEditable = (k: string) => !!extraEditableKeys?.includes(k);
  const fieldReadOnly = (f: FieldDef) =>
    !!f.readOnly || (readOnly && !isExtraEditable(f.k));
  const notesDirty =
    !!onSaveNotes &&
    isExtraEditable("notes") &&
    String(draft.notes || "") !== String(record.notes || "");
  const firstEdit = readOnly
    ? (visible.find((x) => isExtraEditable(x.k) && !x.readOnly)?.k || null)
    : (
        visible.find(
          (x) =>
            !x.readOnly &&
            x.type !== "computed" &&
            x.type !== "thread" &&
            x.type !== "files" &&
            !(x.managerOnly && !manager)
        ) || ({} as FieldDef)
      ).k;

  const fileStage =
    tab.k === "ops" ? "ops" : tab.k === "documentation" ? "documentation" : "closer";

  if (!mounted) return null;

  return createPortal(
    <div className="crm-overlay" style={{ position: "fixed", inset: 0, zIndex: 70 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(20,2,6,0.55)" }} />
      <aside
        className="crm-drawer"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(500px, 92vw)",
          maxWidth: "92vw",
          background: C.surface,
          boxShadow: "-18px 0 50px rgba(30,26,27,0.22)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.blue,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {isNew ? "New " : ""}
              {tab.label}
              {readOnly ? " · read-only" : ""}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 2 }}>{title}</div>
            {idtag ? (
              <div className="mono" style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
                {idtag}
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: C.lineSoft,
              borderRadius: 8,
              padding: 7,
              cursor: "pointer",
              color: C.inkSoft,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {!isNew && idtag ? <Journey leadId={idtag} currentKey={tab.k} viewTabs={viewTabs} /> : null}

        {tab.note ? (
          <div
            style={{
              margin: "14px 22px 0",
              background: C.blueSoft,
              border: `1px solid ${C.blue}33`,
              borderRadius: 10,
              padding: "10px 12px",
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
            }}
          >
            <Zap size={15} style={{ color: C.blueDeep, marginTop: 1, flexShrink: 0 }} />
            <div style={{ fontSize: 12.5, color: C.blueDeep, lineHeight: 1.4 }}>{tab.note}</div>
          </div>
        ) : null}

        {afterDispute ? (
          <div
            style={{
              margin: "14px 22px 0",
              background: TONES.info.bg,
              border: `1px solid ${TONES.info.fg}44`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              color: TONES.info.fg,
              lineHeight: 1.4,
            }}
          >
            {isOpsDispute
              ? "After OPS dispute — AVP approved; this deal returned to OPS QA."
              : "After dispute — supervisor approved a Lead Gen dispute on this lead."}
          </div>
        ) : null}

        {disputeStatus === "disapproved" ? (
          <div
            style={{
              margin: "14px 22px 0",
              background: TONES.bad.bg,
              border: `1px solid ${TONES.bad.fg}44`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              color: TONES.bad.fg,
              lineHeight: 1.4,
            }}
          >
            Dispute disapproved
            {disputeReviewNote
              ? ` — ${String(disputeReviewNote)}`
              : ". You may open a new dispute with a stronger reason."}
          </div>
        ) : null}

        {disputeStatus === "open" ? (
          <div
            style={{
              margin: "14px 22px 0",
              background: TONES.warn.bg,
              border: `1px solid ${TONES.warn.fg}44`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 12.5,
              fontWeight: 700,
              color: TONES.warn.fg,
              lineHeight: 1.4,
            }}
          >
            {isOpsDispute
              ? "OPS dispute open — waiting for AVP Sales review."
              : "Dispute open — waiting for your team supervisor."}
            {disputeReasonShown ? (
              <div style={{ fontWeight: 600, marginTop: 4 }}>{String(disputeReasonShown)}</div>
            ) : null}
          </div>
        ) : null}

        {canDispute && onOpenDispute ? (
          <div
            style={{
              margin: "14px 22px 0",
              background: C.bg,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginBottom: 8 }}>
              {isOpsDispute
                ? "Disqualified by OPS. Create a dispute for AVP Sales."
                : "This lead was disqualified. Create a dispute for your supervisor."}
            </div>
            {isOpsDispute && record.ops_reasoning ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 8 }}>
                OPS reason: {String(record.ops_reasoning)}
              </div>
            ) : null}
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder={
                isOpsDispute
                  ? "Why should OPS reverse this disapproval?"
                  : "Why should QA reverse this disqualification?"
              }
              rows={3}
              className="app-control"
              style={{ width: "100%", fontSize: 13, resize: "vertical", marginBottom: 8 }}
            />
            <button
              type="button"
              disabled={disputeBusy || !disputeReason.trim()}
              className="app-cta"
              style={{
                fontSize: 12,
                padding: "8px 12px",
                opacity: disputeBusy || !disputeReason.trim() ? 0.5 : 1,
              }}
              onClick={async () => {
                setDisputeBusy(true);
                try {
                  await onOpenDispute(disputeReason.trim());
                  setDisputeReason("");
                } finally {
                  setDisputeBusy(false);
                }
              }}
            >
              {disputeBusy ? "Submitting…" : "Create dispute"}
            </button>
          </div>
        ) : null}

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
          <div className="drawer-grid">
            {fullFields.map((f) => (
              <Field
                key={f.k}
                f={f}
                value={draft}
                opts={opts}
                onChange={onChange}
                onPatch={onPatch}
                readOnly={fieldReadOnly(f)}
                manager={manager}
                autoFocus={f.k === firstEdit}
                locked={!!ownerLock && f.k === ownerLock.field}
                lockedValue={ownerLock ? ownerLock.value : undefined}
                fileStage={fileStage}
                allowComment={allowComment && f.type === "thread"}
              />
            ))}
          </div>
          {longFields.length ? (
            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              {longFields.map((f) => (
                <Field
                  key={f.k}
                  f={f}
                  value={draft}
                  opts={opts}
                  onChange={onChange}
                  onPatch={onPatch}
                  readOnly={fieldReadOnly(f)}
                  manager={manager}
                  autoFocus={f.k === firstEdit}
                  locked={!!ownerLock && f.k === ownerLock.field}
                  lockedValue={ownerLock ? ownerLock.value : undefined}
                  fileStage={fileStage}
                  allowComment={allowComment && f.type === "thread"}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {!isNew && !readOnly && canDelete ? (
            <button
              onClick={() => onDelete(draft)}
              style={{
                border: "none",
                background: "transparent",
                color: TONES.bad.fg,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
          ) : null}
          <div style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              border: `1px solid ${C.line}`,
              background: C.surface,
              color: C.inkSoft,
              borderRadius: 9,
              padding: "9px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {allowComment && onAddComment && String(draft.__newComment || "").trim() ? (
            <button
              onClick={async () => {
                const body = String(draft.__newComment || "").trim();
                if (!body) return;
                setSaving(true);
                await onAddComment(body);
                setSaving(false);
              }}
              disabled={saving}
              className="btnp"
              style={{
                border: "none",
                background: readOnly
                  ? "linear-gradient(180deg,#ba161c,#8e1015)"
                  : C.blueDeep,
                color: "#fff",
                borderRadius: 10,
                padding: "10px 22px",
                fontSize: 13,
                fontWeight: 700,
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: readOnly ? "0 6px 16px rgba(196,19,47,0.28)" : "none",
              }}
            >
              {saving ? "Saving..." : "Add comment"}
            </button>
          ) : null}
          {readOnly && notesDirty && onSaveNotes ? (
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  await onSaveNotes(String(draft.notes || ""));
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className="btnp"
              style={{
                border: "none",
                background: "linear-gradient(180deg,#ba161c,#8e1015)",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 22px",
                fontSize: 13,
                fontWeight: 700,
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 6px 16px rgba(196,19,47,0.28)",
              }}
            >
              {saving ? "Saving..." : "Save notes"}
            </button>
          ) : null}
          {!readOnly ? (
            <button
              onClick={async () => {
                setSaving(true);
                await onSave(draft, isNew);
                setSaving(false);
              }}
              disabled={saving}
              className="btnp"
              style={{
                border: "none",
                background: "linear-gradient(180deg,#ba161c,#8e1015)",
                color: "#fff",
                borderRadius: 10,
                padding: "10px 22px",
                fontSize: 13,
                fontWeight: 700,
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 6px 16px rgba(196,19,47,0.28)",
              }}
            >
              {saving ? "Saving..." : isNew ? "Create" : "Save changes"}
            </button>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body
  );
}
