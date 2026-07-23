"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { C } from "@/lib/theme";
import { SCHEMAS } from "@/lib/schemas";
import { TABS, type TabKey } from "@/lib/constants";
import type { Rec } from "@/lib/types";
import type { OptsCtx } from "@/lib/schemas";
import Field from "@/components/Field";
import { useApp } from "@/components/app-context";
import { getStagePeek, loadStagePeek } from "@/lib/stage-peek-cache";

type FileStage = "closer" | "documentation" | "ops" | "msp" | "fulfillment" | "leasing";

function fileStageFor(tab: TabKey): FileStage | undefined {
  if (tab === "ops") return "ops";
  if (tab === "documentation") return "documentation";
  if (tab === "msp") return "msp";
  if (tab === "closer") return "closer";
  if (tab === "fulfillment") return "fulfillment";
  if (tab === "leasing") return "leasing";
  return undefined;
}

export default function StagePeekDrawer({
  leadId,
  stageTab,
  onClose,
}: {
  leadId: string;
  stageTab: TabKey;
  onClose: () => void;
}) {
  const app = useApp();
  const tabDef = TABS.find((t) => t.k === stageTab);
  const cached = getStagePeek(leadId, stageTab);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState(
    cached?.error === "not_found"
      ? `${leadId} has no ${tabDef?.label || stageTab} record.`
      : cached?.error && cached.error !== "not_found"
        ? cached.error
        : ""
  );
  const [record, setRecord] = useState<Rec | null>(cached?.row || null);

  const fields = SCHEMAS[stageTab] || [];
  const title =
    String(record?.business_name || record?.legal_business_name || record?.dba_name || "").trim() ||
    leadId;

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const hit = getStagePeek(leadId, stageTab);
    if (hit) {
      setRecord(hit.row);
      setError(
        hit.error === "not_found"
          ? `${leadId} has no ${tabDef?.label || stageTab} record.`
          : hit.error && hit.error !== "not_found"
            ? hit.error
            : ""
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setRecord(null);
    void loadStagePeek(leadId, stageTab).then((entry) => {
      if (!alive) return;
      setRecord(entry.row);
      setError(
        entry.error === "not_found"
          ? `${leadId} has no ${tabDef?.label || stageTab} record.`
          : entry.error && entry.error !== "not_found"
            ? entry.error
            : ""
      );
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [stageTab, leadId, tabDef?.label]);

  if (!mounted) return null;

  const gridFields = fields.filter((f) => !f.long && f.type !== "thread" && f.type !== "files");
  const longFields = fields.filter((f) => f.long || f.type === "thread" || f.type === "files");
  const noop = () => {};
  const opts: OptsCtx = app.opts;
  const fileStage = fileStageFor(stageTab);

  return createPortal(
    <div className="crm-overlay" style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(20,2,6,0.35)" }}
      />
      <aside
        className="crm-drawer"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          height: "100%",
          width: "min(720px, 96vw)",
          maxWidth: "96vw",
          background: C.surface,
          boxShadow: "-18px 0 50px rgba(30,26,27,0.22)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "none",
                background: "transparent",
                color: C.blue,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
                marginBottom: 6,
              }}
            >
              <ArrowLeft size={14} />
              Back
            </button>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.blue,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {tabDef?.label || stageTab} · read-only
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, marginTop: 2 }}>{title}</div>
            <div className="mono" style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
              {leadId}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: C.lineSoft,
              borderRadius: 8,
              padding: 7,
              cursor: "pointer",
              color: C.inkSoft,
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "16px 22px", minWidth: 0 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: C.inkFaint }}>Loading…</div>
          ) : error ? (
            <div style={{ fontSize: 13, color: "#b45309" }}>{error}</div>
          ) : record ? (
            <>
              <div className="drawer-grid">
                {gridFields.map((f) => (
                  <Field
                    key={f.k}
                    f={f}
                    value={record}
                    opts={opts}
                    onChange={noop}
                    onPatch={noop}
                    readOnly
                    manager={app.isManager}
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
                      value={record}
                      opts={opts}
                      onChange={noop}
                      onPatch={noop}
                      readOnly
                      manager={app.isManager}
                      fileStage={fileStage}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body
  );
}
