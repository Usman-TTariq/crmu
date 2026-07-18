"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { C } from "@/lib/theme";

export default function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  disabled,
  loading,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** True while a page fetch is in flight — keeps page number visible. */
  loading?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, total);
  const busy = !!disabled || !!loading;
  const canPrev = safePage > 1 && !busy;
  const canNext = safePage < pageCount && !busy;

  if (total === 0 && !busy) {
    return null;
  }

  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    border: `1px solid ${C.line}`,
    background: enabled ? C.surface : C.lineSoft,
    color: enabled ? C.ink : C.inkFaint,
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: enabled ? "pointer" : "default",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
        padding: "12px 14px",
        borderTop: `1px solid ${C.lineSoft}`,
        background: C.bg,
      }}
    >
      <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600 }}>
        {loading ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.ink }}>
            <Loader2 size={14} className="spin" style={{ color: C.blue }} />
            Loading page {safePage}…
          </span>
        ) : (
          <>
            Showing {from}–{to} of {total}
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" disabled={!canPrev} onClick={() => onPageChange(safePage - 1)} style={btnStyle(canPrev)}>
          <ChevronLeft size={14} /> Prev
        </button>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 800,
            color: loading ? C.blue : C.ink,
            minWidth: 96,
            textAlign: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          Page {safePage} of {pageCount}
        </span>
        <button type="button" disabled={!canNext} onClick={() => onPageChange(safePage + 1)} style={btnStyle(canNext)}>
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
