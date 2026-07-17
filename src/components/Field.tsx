"use client";

import React from "react";
import { C, TONES } from "@/lib/theme";
import { isBlank, money, pct, numfmt, stamp, today, formatUsPhone } from "@/lib/format";
import type { FieldDef, OptsCtx } from "@/lib/schemas";
import type { Attachment, Rec, RetentionComment } from "@/lib/types";
import FileField from "@/components/FileField";
import AddressField from "@/components/AddressField";

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
  readOnly,
  manager,
  autoFocus,
  locked,
  lockedValue,
  fileStage,
}: {
  f: FieldDef;
  value: Rec;
  opts: OptsCtx;
  onChange: (f: { k: string }, v: unknown) => void;
  readOnly: boolean;
  manager: boolean;
  autoFocus?: boolean;
  locked?: boolean;
  lockedValue?: string;
  fileStage?: "closer" | "ops";
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
      : numfmt(v);
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
    const list = Array.isArray(value[f.k]) ? (value[f.k] as RetentionComment[]) : [];
    return (
      <div>
        {lbl}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: ro ? 0 : 10 }}>
          {list.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkFaint }}>No comments yet.</div>
          ) : (
            list.map((c, i) => (
              <div
                key={i}
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
                    {String(c.created_at).slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: C.ink, marginTop: 3, whiteSpace: "pre-wrap" }}>{c.body}</div>
              </div>
            ))
          )}
        </div>
        {!ro ? (
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
    return (
      <div>
        {lbl}
        <div className={f.mono ? "mono" : ""} style={{ ...base, background: C.lineSoft, color: C.inkSoft }}>
          {isBlank(value[f.k]) ? "-" : String(value[f.k])}
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
          onChange({ k: "business_address" }, parts.business_address);
          onChange({ k: "city" }, parts.city);
          onChange({ k: "state" }, parts.state);
          onChange({ k: "zip_code" }, parts.zip_code);
        }}
      />
    );
  }

  if (f.type === "select") {
    const list = typeof f.opts === "function" ? f.opts(opts) : f.opts || [];
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
    return (
      <div>
        {lbl}
        <select
          autoFocus={autoFocus}
          value={String(value[f.k] ?? "")}
          onChange={(e) => onChange(f, e.target.value)}
          style={base}
        >
          <option value="">-</option>
          {list.map((o) => (
            <option key={o} value={o}>
              {o}
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
