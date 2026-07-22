"use client";

import React from "react";
import { C, TONES } from "@/lib/theme";
import {
  isBlank,
  money,
  pct,
  numfmt,
  stamp,
  today,
  formatUsPhone,
  sortLeadComments,
} from "@/lib/format";
import type { FieldDef, OptsCtx } from "@/lib/schemas";
import type { Attachment, LeadComment, Rec } from "@/lib/types";
import FileField from "@/components/FileField";
import AddressField from "@/components/AddressField";
import EditableSelect from "@/components/EditableSelect";
import { normalizeStateCode } from "@/lib/us-locations";

const base: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: C.ink,
  background: C.surface,
  outline: "none",
  fontFamily: "inherit",
};

/** US flag — matches the +1 / (XXX) XXX-XXXX phone pattern used in this CRM. */
function UsFlag({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round((size * 10) / 19)} viewBox="0 0 19 10" aria-hidden style={{ display: "block", borderRadius: 2, flexShrink: 0 }}>
      <rect width="19" height="10" fill="#B22234" />
      <path d="M0 1.1h19M0 3.3h19M0 5.5h19M0 7.7h19" stroke="#fff" strokeWidth="1.1" />
      <rect width="7.6" height="5.4" fill="#3C3B6E" />
    </svg>
  );
}

function PhoneShell({
  children,
  muted,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      style={{
        ...base,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "0 12px",
        background: muted ? C.lineSoft : C.surface,
        color: muted ? C.inkSoft : C.ink,
      }}
    >
      <UsFlag />
      <span
        className="mono"
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: muted ? C.inkFaint : C.inkSoft,
          flexShrink: 0,
          letterSpacing: "0.02em",
        }}
      >
        +1
      </span>
      <span style={{ width: 1, alignSelf: "stretch", background: C.line, margin: "8px 0", flexShrink: 0 }} />
      {children}
    </div>
  );
}

export default function Field({
  f,
  value,
  opts,
  onChange,
  onPatch,
  readOnly,
  manager,
  autoFocus,
  locked,
  lockedValue,
  fileStage,
  allowComment,
}: {
  f: FieldDef;
  value: Rec;
  opts: OptsCtx;
  onChange: (f: { k: string }, v: unknown) => void;
  onPatch?: (patch: Record<string, unknown>) => void;
  readOnly: boolean;
  manager: boolean;
  autoFocus?: boolean;
  locked?: boolean;
  lockedValue?: string;
  fileStage?: "closer" | "ops" | "documentation";
  /** Allow appending comments even when the drawer is read-only */
  allowComment?: boolean;
}) {
  const lbl = (
    <label
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 700,
        color: C.inkSoft,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        marginBottom: 5,
      }}
    >
      {f.label}
    </label>
  );
  const ro = readOnly || f.readOnly || (f.managerOnly && !manager);

  if (locked) {
    return (
      <div>
        {lbl}
        <div
          className={f.mono ? "mono" : ""}
          style={{
            ...base,
            background: C.lineSoft,
            color: C.inkSoft,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{isBlank(value[f.k]) ? lockedValue || "-" : String(value[f.k])}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: C.blueDeep,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              flexShrink: 0,
            }}
          >
            You
          </span>
        </div>
      </div>
    );
  }

  if (f.type === "computed") {
    const v = f.compute ? f.compute(value) : value[f.k];
    const txt = f.isPill
      ? String(v ?? "-")
      : f.fmt === "money"
      ? money(v)
      : f.fmt === "pct"
      ? pct(v)
      : f.fmt === "stamp"
      ? stamp(v)
      : f.fmt === "num"
      ? numfmt(v)
      : String(v ?? "-");
    return (
      <div>
        {lbl}
        <div
          className={f.isPill ? "" : "mono"}
          style={{ ...base, background: C.lineSoft, color: C.inkSoft, fontWeight: 600 }}
        >
          {txt} <span style={{ fontSize: 11, fontWeight: 500 }}>&middot; auto</span>
        </div>
      </div>
    );
  }

  if (f.type === "thread") {
    const list = sortLeadComments(
      Array.isArray(value[f.k]) ? (value[f.k] as LeadComment[]) : []
    );
    const canCompose = (!ro || !!allowComment) && !!value.lead_id;
    return (
      <div>
        {lbl}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: canCompose ? 10 : 0 }}>
          {list.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkFaint }}>No comments yet.</div>
          ) : (
            list.map((c) => (
              <div
                key={c.id || `${c.author}-${c.created_at}`}
                style={{
                  background: C.lineSoft,
                  border: `1px solid ${C.line}`,
                  borderRadius: 10,
                  padding: "8px 11px",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.blueDeep,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span>{c.author}</span>
                  <span className="mono" style={{ color: C.inkFaint, fontWeight: 500 }}>
                    {stamp(c.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: C.ink, marginTop: 3, whiteSpace: "pre-wrap" }}>{c.body}</div>
              </div>
            ))
          )}
        </div>
        {canCompose ? (
          <textarea
            value={String(value.__newComment ?? "")}
            onChange={(e) => onChange({ k: "__newComment" }, e.target.value)}
            rows={2}
            placeholder="Add a comment. It is saved with your name and the time, and cannot be edited or deleted afterward."
            style={{ ...base, resize: "vertical" }}
          />
        ) : null}
      </div>
    );
  }

  if (f.type === "files") {
    const list = Array.isArray(value[f.k]) ? (value[f.k] as Attachment[]) : [];
    return (
      <FileField
        leadId={String(value.lead_id || "")}
        stage={fileStage || "closer"}
        list={list}
        readOnly={!!ro || !value.lead_id}
        onChange={(next) => onChange(f, next)}
        label={lbl}
      />
    );
  }

  if (ro) {
    if (f.type === "phone") {
      const shown = isBlank(value[f.k]) ? "" : formatUsPhone(value[f.k]) || String(value[f.k]);
      return (
        <div>
          {lbl}
          <PhoneShell muted>
            <span className="mono" style={{ flex: 1, minWidth: 0, padding: "10px 0", fontWeight: 600 }}>
              {shown || "-"}
            </span>
          </PhoneShell>
        </div>
      );
    }
    // Forwarded notes / long text: show real text (pre-wrap), never a lone dash placeholder
    const raw = value[f.k];
    const text = isBlank(raw) || raw === "-" ? "" : String(raw);
    const isNotesLike =
      !!f.long ||
      /(_notes|_comments|_reasoning|notes|reasoning|fail_reason)$/i.test(f.k);
    return (
      <div>
        {lbl}
        <div
          className={f.mono ? "mono" : ""}
          style={{
            ...base,
            background: C.lineSoft,
            color: text ? C.inkSoft : C.inkFaint,
            whiteSpace: isNotesLike ? "pre-wrap" : undefined,
            minHeight: isNotesLike ? 44 : undefined,
          }}
        >
          {text || (isNotesLike ? "" : "-")}
        </div>
      </div>
    );
  }

  if (f.type === "phone") {
    return (
      <div>
        {lbl}
        <PhoneShell>
          <input
            autoFocus={autoFocus}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(555) 123-4567"
            value={formatUsPhone(value[f.k])}
            onChange={(e) => onChange(f, formatUsPhone(e.target.value))}
            className="mono"
            style={{
              flex: 1,
              minWidth: 0,
              border: "none",
              background: "transparent",
              outline: "none",
              padding: "10px 0",
              fontSize: 14,
              color: C.ink,
              fontFamily: "inherit",
            }}
          />
        </PhoneShell>
      </div>
    );
  }

  if (f.type === "address") {
    return (
      <AddressField
        label={lbl}
        autoFocus={autoFocus}
        value={String(value[f.k] ?? "")}
        onChange={(v) => onChange(f, v)}
        onResolved={(parts) => {
          const state = normalizeStateCode(parts.state);
          const patch = {
            business_address: parts.business_address,
            state,
            city: parts.city,
            zip_code: parts.zip_code,
          };
          if (onPatch) onPatch(patch);
          else {
            onChange({ k: "business_address" }, patch.business_address);
            onChange({ k: "state" }, patch.state);
            onChange({ k: "city" }, patch.city);
            onChange({ k: "zip_code" }, patch.zip_code);
          }
        }}
      />
    );
  }

  if (f.type === "select") {
    const list = typeof f.opts === "function" ? f.opts(opts, value) : f.opts || [];
    const isYN = list.length === 2 && list[0] === "Yes" && list[1] === "No";
    if (isYN) {
      return (
        <div>
          {lbl}
          <div style={{ display: "flex", gap: 6 }}>
            {(["Yes", "No"] as const).map((o) => {
              const on = value[f.k] === o;
              const t = o === "Yes" ? TONES.good : TONES.bad;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => onChange(f, on ? "" : o)}
                  title={on ? "Click again to clear" : "Set " + o}
                  style={{
                    flex: 1,
                    border: `1.5px solid ${on ? t.fg : C.line}`,
                    background: on ? t.bg : C.surface,
                    color: on ? t.fg : C.inkSoft,
                    borderRadius: 10,
                    padding: "9px 0",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    const requiredOk = !f.requires || !!String(value[f.requires] ?? "").trim();
    const disabled = !!ro || !requiredOk;
    let selectValue = String(value[f.k] ?? "");
    if (f.k === "state" && selectValue) {
      selectValue = normalizeStateCode(selectValue);
    }
    const placeholder =
      !requiredOk && f.requires ? `Select ${f.requires.replace(/_/g, " ")} first` : "-";
    if (f.editable) {
      return (
        <div>
          {lbl}
          <EditableSelect
            autoFocus={autoFocus}
            value={selectValue}
            options={list}
            optLabel={f.optLabel}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(v) => onChange(f, f.k === "state" ? normalizeStateCode(v) || v : v)}
            commit={f.k === "state" ? (raw) => normalizeStateCode(raw) || raw.trim() : undefined}
          />
        </div>
      );
    }
    return (
      <div>
        {lbl}
        <select
          autoFocus={autoFocus}
          value={selectValue}
          disabled={disabled}
          onChange={(e) => onChange(f, e.target.value)}
          title={
            !requiredOk && f.requires
              ? `Select ${f.requires.replace(/_/g, " ")} first`
              : undefined
          }
          style={{
            ...base,
            background: disabled ? C.lineSoft : C.surface,
            color: disabled ? C.inkSoft : C.ink,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <option value="">{placeholder}</option>
          {list.map((o) => (
            <option key={o} value={o}>
              {f.optLabel ? f.optLabel(o) : o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (f.long) {
    return (
      <div>
        {lbl}
        <textarea
          autoFocus={autoFocus}
          value={String(value[f.k] ?? "")}
          onChange={(e) => onChange(f, e.target.value)}
          rows={3}
          style={{ ...base, resize: "vertical" }}
        />
      </div>
    );
  }

  if (f.type === "date") {
    return (
      <div>
        {lbl}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            autoFocus={autoFocus}
            type="date"
            value={String(value[f.k] ?? "")}
            onChange={(e) => onChange(f, e.target.value)}
            style={{ ...base, flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            onClick={() => onChange(f, today())}
            title="Set to today"
            style={{
              border: `1px solid ${C.line}`,
              background: C.lineSoft,
              color: C.inkSoft,
              borderRadius: 10,
              padding: "0 10px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Today
          </button>
        </div>
      </div>
    );
  }

  const type = f.type === "num" ? "number" : "text";
  return (
    <div>
      {lbl}
      <input
        autoFocus={autoFocus}
        type={type}
        value={String(value[f.k] ?? "")}
        onChange={(e) => onChange(f, e.target.value)}
        className={f.mono ? "mono" : ""}
        style={base}
      />
    </div>
  );
}
