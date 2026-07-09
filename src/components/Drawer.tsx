"use client";

import React, { useState } from "react";
import { Trash2, X, Zap } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import type { FieldDef, OptsCtx } from "@/lib/schemas";
import type { Rec } from "@/lib/types";
import type { TabDef, TabKey } from "@/lib/constants";
import Field from "@/components/Field";
import Journey from "@/components/Journey";

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
}) {
  const [draft, setDraft] = useState<Rec>(() =>
    ownerLock ? { ...record, [ownerLock.field]: ownerLock.value } : record
  );
  const [saving, setSaving] = useState(false);

  const onChange = (f: { k: string }, v: unknown) => setDraft((d) => ({ ...d, [f.k]: v }));

  const title = String(draft.business_name || draft.full_name || "Record");
  const idtag = String(draft.lead_id || "");
  // Manual additions need the normally read-only carry-over fields editable
  const effFields = fields.map((f) =>
    isNew && f.readOnly && f.k !== "lead_id" ? { ...f, readOnly: false } : f
  );
  const visible = effFields.filter((f) => !(f.k === "lost_reason" && draft.stage !== "Closed Lost"));
  const fullFields = visible.filter((f) => !f.long && f.type !== "thread" && f.type !== "files");
  const longFields = visible.filter((f) => f.long || f.type === "thread" || f.type === "files");
  const firstEdit = readOnly
    ? null
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

  const fileStage = tab.k === "ops" ? "ops" : "closer";

  return (
    <div className="crm-overlay" style={{ position: "fixed", inset: 0, zIndex: 40 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(20,2,6,0.55)" }} />
      <aside
        className="crm-drawer"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: 500,
          maxWidth: "94vw",
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

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {fullFields.map((f) => (
              <Field
                key={f.k}
                f={f}
                value={draft}
                opts={opts}
                onChange={onChange}
                readOnly={readOnly}
                manager={manager}
                autoFocus={f.k === firstEdit}
                locked={!!ownerLock && f.k === ownerLock.field}
                lockedValue={ownerLock ? ownerLock.value : undefined}
                fileStage={fileStage}
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
                  readOnly={readOnly}
                  manager={manager}
                  autoFocus={f.k === firstEdit}
                  locked={!!ownerLock && f.k === ownerLock.field}
                  lockedValue={ownerLock ? ownerLock.value : undefined}
                  fileStage={fileStage}
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
                background: "linear-gradient(180deg,#D2203A,#A6112A)",
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
    </div>
  );
}
