"use client";

// Supervisor panel: open team disputes — approve (back to QA) or disapprove.

import React, { useCallback, useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { Panel } from "@/components/dash";
import {
  fetchOpenDisputes,
  reviewDispute,
  type DisputeRow,
} from "@/actions/disputes";

export default function DisputePanel({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetchOpenDisputes().then((res) => {
      setRows(res.rows || []);
      setErr(res.error || "");
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, decision: "approved" | "disapproved") => {
    setBusyId(id);
    const res = await reviewDispute({
      disputeId: id,
      decision,
      note: notes[id] || "",
    });
    setBusyId(null);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    load();
    onChanged?.();
  };

  if (err && !rows.length) {
    return (
      <div
        style={{
          marginBottom: 14,
          padding: "12px 14px",
          borderRadius: 12,
          background: TONES.warn.bg,
          color: TONES.warn.fg,
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        {err.includes("dispute") || err.includes("does not exist")
          ? "Dispute SQL not applied yet. Run sql/33_qa_disputes.sql in Supabase."
          : err}
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <Panel
        title="Open disputes"
        right={
          <span style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
            {rows.length} awaiting review
          </span>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((d) => (
            <div
              key={d.id}
              style={{
                border: `1px solid ${C.lineSoft}`,
                borderRadius: 12,
                padding: "12px 14px",
                background: C.bg,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <Scale size={16} style={{ color: C.blue, marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>
                    {d.business_name || d.lead_id}
                    <span style={{ fontWeight: 600, color: C.inkSoft, marginLeft: 8, fontSize: 12 }}>
                      {d.lead_id}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginTop: 2 }}>
                    Opened by {d.opened_by}
                    {d.owner_name ? ` · Owner ${d.owner_name}` : ""}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 8, lineHeight: 1.45 }}>
                    {d.reason}
                  </div>
                </div>
              </div>
              <input
                value={notes[d.id] || ""}
                onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                placeholder="Review note (optional)"
                className="app-control"
                style={{ width: "100%", marginBottom: 8, fontSize: 12 }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busyId === d.id}
                  onClick={() => void decide(d.id, "approved")}
                  className="app-cta"
                  style={{ fontSize: 12, padding: "7px 12px" }}
                >
                  Approve → QA
                </button>
                <button
                  type="button"
                  disabled={busyId === d.id}
                  onClick={() => void decide(d.id, "disapproved")}
                  style={{
                    border: `1px solid ${TONES.bad.fg}`,
                    background: TONES.bad.bg,
                    color: TONES.bad.fg,
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: busyId === d.id ? "default" : "pointer",
                  }}
                >
                  Disapprove
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
