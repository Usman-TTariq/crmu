"use client";

import React, { useEffect, useRef } from "react";
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
import { useApp } from "@/components/app-context";

function commentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function splitCommentBody(body: string): { tag: string; text: string } {
  const m = body.match(/^\[([^\]]+)\]\s*\n?([\s\S]*)$/);
  if (!m) return { tag: "", text: body };
  return { tag: m[1], text: (m[2] || "").trim() };
}

function CommentThread({
  label,
  value,
  onChange,
  canCompose,
  fieldKey,
}: {
  label: React.ReactNode;
  value: Rec;
  onChange: (f: { k: string }, v: unknown) => void;
  canCompose: boolean;
  fieldKey: string;
}) {
  const app = useApp();
  const me = String(app.session?.profile?.full_name || "").trim().toLowerCase();
  const list = sortLeadComments(
    Array.isArray(value[fieldKey]) ? (value[fieldKey] as LeadComment[]) : []
  );
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [list.length, list[list.length - 1]?.id, list[list.length - 1]?.created_at]);

  return (
    <div>
      {label}
      <div
        ref={scrollerRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: canCompose ? 12 : 0,
          background: "#eceff3",
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          padding: "14px 12px",
          maxHeight: 360,
          overflowY: "auto",
        }}
      >
        {list.length === 0 ? (
          <div style={{ fontSize: 13, color: C.inkFaint, textAlign: "center", padding: "18px 8px" }}>
            No comments yet.
          </div>
        ) : (
          list.map((c) => {
            const author = String(c.author || "").trim() || "Unknown";
            const mine = !!me && author.toLowerCase() === me;
            const { tag, text } = splitCommentBody(String(c.body || ""));
            const bubbleBg = mine ? "#2b3038" : C.surface;
            const bubbleFg = mine ? "#fff" : C.ink;
            const metaFg = mine ? "rgba(255,255,255,0.65)" : C.inkFaint;
            return (
              <div
                key={c.id || `${c.author}-${c.created_at}`}
                style={{
                  display: "flex",
                  flexDirection: mine ? "row-reverse" : "row",
                  alignItems: "flex-end",
                  gap: 8,
                  maxWidth: "100%",
                }}
              >
                {!mine ? (
                  <div
                    title={author}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: C.blueSoft,
                      color: C.blueDeep,
                      fontSize: 11,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {commentInitials(author)}
                  </div>
                ) : null}
                <div style={{ maxWidth: "min(78%, 420px)", minWidth: 0 }}>
                  {!mine ? (
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.inkSoft,
                        margin: "0 0 3px 4px",
                      }}
                    >
                      {author}
                    </div>
                  ) : null}
                  <div
                    style={{
                      background: bubbleBg,
                      color: bubbleFg,
                      borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      padding: "9px 12px",
                      boxShadow: "0 1px 2px rgba(18,21,26,0.08)",
                    }}
                  >
                    {tag ? (
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: mine ? "rgba(255,255,255,0.75)" : C.blueDeep,
                          marginBottom: 4,
                        }}
                      >
                        {tag}
                      </div>
                    ) : null}
                    <div
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {text || String(c.body || "")}
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 10.5,
                        color: metaFg,
                        marginTop: 5,
                        textAlign: mine ? "right" : "left",
                      }}
                    >
                      {stamp(c.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {canCompose ? (
        <textarea
          value={String(value.__newComment ?? "")}
          onChange={(e) => onChange({ k: "__newComment" }, e.target.value)}
          rows={2}
          placeholder="Type a message…"
          style={{
            ...base,
            resize: "vertical",
            borderRadius: 16,
            background: C.bg,
          }}
        />
      ) : null}
    </div>
  );
}

/** 25000 → "25,000" (keeps any decimal part as typed). */
function formatNumDisplay(raw: string): string {
  if (!raw) return "";
  const [int, ...rest] = raw.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length ? `${grouped}.${rest.join("")}` : grouped;
}

/** Strip grouping/junk; keep digits and a single decimal point. */
function cleanNumInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
}

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
  fileStage?: "closer" | "ops" | "documentation" | "msp" | "fulfillment" | "leasing";
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
      {f.required ? (
        <span style={{ color: C.blue, marginLeft: 3 }} aria-hidden>
          *
        </span>
      ) : null}
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
    if (isBlank(v) || v === "-" || String(v).trim() === "--") {
      if (!f.emptyHint) return null;
      return (
        <div>
          {lbl}
          <div
            style={{
              ...base,
              background: TONES.warn.bg,
              border: `1px dashed ${TONES.warn.fg}55`,
              color: TONES.warn.fg,
              fontWeight: 600,
              fontStyle: "italic",
            }}
          >
            {f.emptyHint}
          </div>
        </div>
      );
    }
    const txt = f.isPill
      ? String(v)
      : f.fmt === "money"
      ? money(v)
      : f.fmt === "pct"
      ? pct(v)
      : f.fmt === "stamp"
      ? stamp(v)
      : f.fmt === "num"
      ? numfmt(v)
      : String(v);
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
    return (
      <CommentThread
        label={lbl}
        value={value}
        onChange={onChange}
        canCompose={(!ro || !!allowComment) && !!value.lead_id}
        fieldKey={f.k}
      />
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
    const blankVal = (raw: unknown) =>
      isBlank(raw) || String(raw).trim() === "-" || String(raw).trim() === "--";
    const emptyBox = (hint: string) => (
      <div>
        {lbl}
        <div
          style={{
            ...base,
            background: TONES.warn.bg,
            border: `1px dashed ${TONES.warn.fg}55`,
            color: TONES.warn.fg,
            fontWeight: 600,
            fontStyle: "italic",
          }}
        >
          {hint}
        </div>
      </div>
    );
    if (f.type === "phone") {
      const rawPhone = value[f.k];
      if (blankVal(rawPhone)) {
        return f.emptyHint ? emptyBox(f.emptyHint) : null;
      }
      const shown = formatUsPhone(rawPhone) || String(rawPhone);
      return (
        <div>
          {lbl}
          <PhoneShell muted>
            <span className="mono" style={{ flex: 1, minWidth: 0, padding: "10px 0", fontWeight: 600 }}>
              {shown}
            </span>
          </PhoneShell>
        </div>
      );
    }
    // Read-only: real text, or closer/LG empty hint (never a lone "-")
    const raw = value[f.k];
    if (blankVal(raw)) {
      return f.emptyHint ? emptyBox(f.emptyHint) : null;
    }
    const text =
      f.type === "num"
        ? f.fmt === "money"
          ? money(raw)
          : numfmt(raw)
        : String(raw);
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
            color: C.inkSoft,
            whiteSpace: isNotesLike ? "pre-wrap" : undefined,
            minHeight: isNotesLike ? 44 : undefined,
          }}
        >
          {text}
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
      !requiredOk && f.requires
        ? `Select ${f.requires.replace(/_/g, " ")} first`
        : f.k === "qa_agent" || f.k === "ops_agent"
          ? "Select agent"
          : "-";
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
    const longVal = String(value[f.k] ?? "").trim();
    const shown = longVal === "-" || longVal === "--" ? "" : String(value[f.k] ?? "");
    return (
      <div>
        {lbl}
        <textarea
          autoFocus={autoFocus}
          value={shown}
          onChange={(e) => onChange(f, e.target.value)}
          rows={3}
          style={{ ...base, resize: "vertical" }}
          placeholder=""
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

  if (f.type === "num") {
    // Text input (not type=number): wheel-scrolling a focused number input
    // silently changes the value, which corrupted entered volumes. Commas
    // make the entered amount verifiable at a glance.
    return (
      <div>
        {lbl}
        <input
          autoFocus={autoFocus}
          type="text"
          inputMode="decimal"
          value={formatNumDisplay(String(value[f.k] ?? ""))}
          onChange={(e) => onChange(f, cleanNumInput(e.target.value))}
          className="mono"
          style={base}
        />
      </div>
    );
  }

  return (
    <div>
      {lbl}
      <input
        autoFocus={autoFocus}
        type="text"
        value={String(value[f.k] ?? "")}
        onChange={(e) => onChange(f, e.target.value)}
        className={f.mono ? "mono" : ""}
        style={base}
      />
    </div>
  );
}
