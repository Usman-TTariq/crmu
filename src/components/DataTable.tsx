"use client";

import React from "react";
import { Paperclip, Plus } from "lucide-react";
import { C } from "@/lib/theme";
import { isBlank, money, pct, numfmt, stamp, formatUsPhone } from "@/lib/format";
import type { FieldDef } from "@/lib/schemas";
import type { Rec } from "@/lib/types";
import Pill from "@/components/Pill";

function cellContent(f: FieldDef, r: Rec) {
  if (f.type === "computed") {
    const v = f.compute ? f.compute(r) : r[f.k];
    if (f.isPill) return <Pill value={v} />;
    const txt =
      f.fmt === "money" ? money(v) : f.fmt === "pct" ? pct(v) : f.fmt === "stamp" ? stamp(v) : numfmt(v);
    return (
      <span className="mono" style={{ color: C.ink, fontWeight: 600 }}>
        {txt}
      </span>
    );
  }
  if (f.type === "thread") {
    const n = Array.isArray(r[f.k]) ? (r[f.k] as unknown[]).length : 0;
    return (
      <span style={{ color: C.inkSoft }}>
        {n} comment{n === 1 ? "" : "s"}
      </span>
    );
  }
  if (f.type === "files") {
    const n = Array.isArray(r[f.k]) ? (r[f.k] as unknown[]).length : 0;
    return n ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.inkSoft, fontWeight: 600 }}>
        <Paperclip size={13} /> {n}
      </span>
    ) : (
      <span style={{ color: C.inkFaint }}>-</span>
    );
  }
  if (f.type === "select") return <Pill value={r[f.k]} />;
  const v = r[f.k];
  if (isBlank(v)) return <span style={{ color: C.inkFaint }}>-</span>;
  if (f.type === "phone") {
    return (
      <span className="mono" style={{ fontWeight: 600 }}>
        {formatUsPhone(v) || String(v)}
      </span>
    );
  }
  const txt =
    f.fmt === "money" ? money(v) : f.fmt === "pct" ? pct(v) : f.fmt === "num" ? numfmt(v) : String(v);
  return (
    <span
      className={f.mono ? "mono" : ""}
      style={f.fmt === "money" || f.fmt === "num" ? { fontWeight: 600 } : undefined}
    >
      {txt}
    </span>
  );
}

export default function DataTable({
  fields,
  rows,
  onRow,
  rowTone,
  onAdd,
  addLabel,
  groupOf,
}: {
  fields: FieldDef[];
  rows: Rec[];
  onRow: (r: Rec) => void;
  rowTone?: (r: Rec) => string | null;
  onAdd?: () => void;
  addLabel?: string;
  /** When set, a section header row is rendered every time the label changes */
  groupOf?: (r: Rec) => string;
}) {
  const cols = fields.filter((f) => !f.hideTable);
  if (rows.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{ padding: "70px 24px", color: C.inkSoft }}
      >
        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>&empty;</div>
        <div style={{ fontWeight: 600, color: C.ink }}>Nothing in this view</div>
        <div className="text-sm" style={{ marginTop: 4 }}>
          Records matching this role and time frame will appear here.
        </div>
        {onAdd ? (
          <button
            onClick={onAdd}
            className="btnp"
            style={{
              marginTop: 16,
              border: "none",
              background: "linear-gradient(180deg,#ba161c,#8e1015)",
              color: "#fff",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              boxShadow: "0 6px 16px rgba(196,19,47,0.28)",
            }}
          >
            <Plus size={16} /> {addLabel || "Add"}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="data-table-scroll overflow-auto">
      <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 13.5 }}>
        <thead>
          <tr>
            {cols.map((f) => (
              <th
                key={f.k}
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                  background: C.lineSoft,
                  color: C.inkSoft,
                  textAlign: "left",
                  padding: "9px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  borderBottom: `1px solid ${C.line}`,
                }}
              >
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const tone = rowTone ? rowTone(r) : null;
            const group = groupOf ? groupOf(r) : null;
            const prevGroup = groupOf && i > 0 ? groupOf(rows[i - 1]) : null;
            const header =
              group && group !== prevGroup ? (
                <tr key={"group-" + group}>
                  <td
                    colSpan={cols.length}
                    style={{
                      padding: "10px 14px 6px",
                      background: C.bg,
                      color: C.blueDeep,
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      borderBottom: `1px solid ${C.line}`,
                    }}
                  >
                    {group}
                  </td>
                </tr>
              ) : null;
            return (
              <React.Fragment key={r.id}>
                {header}
                <tr
                  onClick={() => onRow(r)}
                  className="crm-row"
                  style={{ background: tone || (i % 2 ? C.bg : C.surface), cursor: "pointer" }}
                >
                  {cols.map((f) => (
                    <td
                      key={f.k}
                      style={{
                        padding: "9px 14px",
                        whiteSpace: "nowrap",
                        color: C.ink,
                        borderBottom: `1px solid ${C.lineSoft}`,
                        maxWidth: f.long ? 280 : undefined,
                        overflow: f.long ? "hidden" : undefined,
                        textOverflow: f.long ? "ellipsis" : undefined,
                      }}
                    >
                      {cellContent(f, r)}
                    </td>
                  ))}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
