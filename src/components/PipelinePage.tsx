"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { num, isBlank, today } from "@/lib/format";
import { SCHEMAS, TAB_TABLE, mspIsFatal } from "@/lib/schemas";
import { TABS, ADDABLE, OWNER_FIELD, type TabKey } from "@/lib/constants";
import type { Rec } from "@/lib/types";
import { useApp } from "@/components/app-context";
import DataTable from "@/components/DataTable";
import Drawer from "@/components/Drawer";
import { createClient } from "@/lib/supabase/client";
import {
  fetchRows,
  saveRecord,
  deleteRecord,
  createManualOpsRecord,
  fetchTabCounts,
  addLeadComment,
  fetchLeadComments,
} from "@/actions/data";
import type { LeadComment } from "@/lib/types";

const PIPELINE_COMMENT_TABS: TabKey[] = [
  "leadgen",
  "qa",
  "sqlassign",
  "closer",
  "ops",
  "msp",
  "fulfillment",
  "leasing",
];

function buildDefault(tab: TabKey): Rec {
  const base: Rec = { id: "", lead_id: "" };
  if (tab === "leadgen") {
    return {
      ...base,
      date_created: today(),
      lead_gen_agent: "",
      lead_source: "Cold Calling",
      business_name: "",
      owner_name: "",
      phone: "",
      email: "",
      business_address: "",
      city: "",
      zip_code: "",
      state: "",
      current_processor: "None",
      current_device: "",
      current_rate: "",
      monthly_volume: "",
      notes: "",
    };
  }
  if (tab === "ops") {
    return {
      ...base,
      closed_date: today(),
      business_name: "",
      owner_name: "",
      phone: "",
      closer: "",
      monthly_volume: "",
      brand: "",
      dl_recd: "",
      voided_check: "",
      bank_stmt: "",
      owner_name_verified: "",
      owner_phone_verified: "",
      business_verified: "",
      ops_status: "Pending",
      reasoning: "",
      ops_agent: "",
      ops_date: today(),
      accuracy_review: "",
      attachments: [],
      notes: "",
    };
  }
  return base;
}

export default function PipelinePage({ tab }: { tab: TabKey }) {
  const app = useApp();
  const tabDef = TABS.find((t) => t.k === tab)!;
  const fields = SCHEMAS[tab] || [];

  const [rows, setRows] = useState<Rec[] | null>(null);
  const [drawer, setDrawer] = useState<{ record: Rec; isNew: boolean } | null>(null);

  const canEdit = app.editTabs.includes(tab);
  const notAllowed = !app.viewTabs.includes(tab);
  const loading = rows === null;

  const pushToasts = app.pushToasts;
  const setCounts = app.setCounts;
  const tf = app.tf;

  const refresh = useCallback(async () => {
    const res = await fetchRows({ tab, tf });
    if (res.error) pushToasts([res.error]);
    setRows(res.rows);
    fetchTabCounts({ tf }).then((c) => setCounts(c));
  }, [tab, tf, pushToasts, setCounts]);

  useEffect(() => {
    if (notAllowed) return;
    let alive = true;
    fetchRows({ tab, tf }).then((res) => {
      if (!alive) return;
      if (res.error) pushToasts([res.error]);
      setRows(res.rows);
    });
    return () => {
      alive = false;
    };
  }, [tab, tf, notAllowed, pushToasts]);

  // Live list: Supabase Realtime → refetch.
  // Publication must include only pipeline tables (sql/12_realtime_publication.sql):
  // leads, qa_records, sql_assignments, closer_deals, ops_verifications,
  // msp_onboarding, fulfillment, leasing, retention — not comments/profiles/attachments.
  useEffect(() => {
    if (notAllowed) return;
    const table = TAB_TABLE[tab];
    // teamsetup uses profiles but has its own page — skip Realtime here
    if (!table || table === "profiles") return;

    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refresh();
      }, 350);
    };

    const channel = supabase
      .channel(`pipeline-${tab}-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleRefresh
      )
      .subscribe();

    const onFocus = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [tab, notAllowed, refresh]);

  // Deep-link: open a specific record after a cross-tab jump (journey pills,
  // CEO recent leads, fatal SLA list). Consumed once rows are loaded.
  const pendingOpen = app.pendingOpen;
  const clearPendingOpen = app.clearPendingOpen;
  useEffect(() => {
    if (!rows || !pendingOpen || pendingOpen.tab !== tab) return;
    const rec = rows.find((r) => r.lead_id === pendingOpen.leadId);
    clearPendingOpen();
    if (rec) setDrawer({ record: rec, isNew: false });
    else pushToasts([`${pendingOpen.leadId} is not visible on this tab.`]);
  }, [rows, pendingOpen, tab, clearPendingOpen, pushToasts]);

  const ownerScope = app.role.row?.[tab];
  const ownerLock =
    ownerScope && OWNER_FIELD[ownerScope]
      ? { field: OWNER_FIELD[ownerScope], value: app.session.profile.full_name }
      : null;
  const ownerField = ownerLock?.field;
  const ownerValue = ownerLock?.value;

  const openAdd = useCallback(() => {
    const rec = buildDefault(tab);
    if (ownerField && ownerValue) rec[ownerField] = ownerValue;
    setDrawer({ record: rec, isNew: true });
  }, [tab, ownerField, ownerValue]);

  // Header "Add" button
  useEffect(() => {
    if (!(canEdit && ADDABLE.includes(tab))) return;
    return app.onAdd(openAdd);
  }, [app, canEdit, tab, openAdd]);

  const onSave = async (draft: Rec, isNew: boolean) => {
    // Client-side guards, mirrored from the prototype (DB enforces them too)
    if (tab === "qa" && draft.qa_decision === "Qualified") {
      const checks = ["us_business", "owner_reached", "interested", "physical_loc", "not_restricted"];
      const fails = checks.filter((k) => draft[k] !== "Yes");
      if (fails.length || num(draft.monthly_volume) <= 5000) {
        app.pushToasts(["Cannot qualify: all 6 checks must be Yes and volume over $5k."]);
        return;
      }
    }
    if (tab === "closer" && draft.stage === "Closed Lost" && isBlank(draft.lost_reason)) {
      app.pushToasts(["Closed Lost needs a reason."]);
      return;
    }
    if (
      tab === "closer" &&
      (draft.stage === "Docs Received" || draft.stage === "Closed" || draft.stage === "Closed Won")
    ) {
      const atts = Array.isArray(draft.attachments) ? (draft.attachments as { doc_type?: string }[]) : [];
      const hasDl = atts.some((a) => a.doc_type === "driving_license");
      const hasVoid = atts.some((a) => a.doc_type === "voided_cheque");
      if (!hasDl || !hasVoid) {
        app.pushToasts([
          "Driving License and Voided Cheque are required before Docs Received or Closed.",
        ]);
        return;
      }
    }

    const values: Record<string, unknown> = { ...draft };
    const newComment = String(values.__newComment || "");
    delete values.__newComment;
    delete values.attachments;
    delete values.comments;
    delete values.lead_comments;

    let res;
    if (isNew && tab === "ops") {
      res = await createManualOpsRecord({ values });
    } else {
      res = await saveRecord({
        tab,
        id: isNew ? null : String(draft.id),
        values,
        newComment: newComment || undefined,
      });
    }

    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    if (res.messages?.length) app.pushToasts(res.messages);

    // Keep drawer open on update; show new comment immediately (no reopen / wait for full table)
    if (!isNew && drawer) {
      const leadId = String(draft.lead_id || "");
      const prev = Array.isArray(draft.lead_comments) ? (draft.lead_comments as LeadComment[]) : [];
      let nextComments = prev;
      if (newComment.trim() && leadId) {
        nextComments = [
          ...prev,
          {
            id: `local-${Date.now()}`,
            lead_id: leadId,
            author: app.session.profile.full_name,
            body: newComment.trim(),
            created_at: new Date().toISOString(),
          },
        ];
      }
      setDrawer({
        record: { ...draft, lead_comments: nextComments, __newComment: "" },
        isNew: false,
      });
      if (leadId && PIPELINE_COMMENT_TABS.includes(tab)) {
        fetchLeadComments({ leadId }).then((c) => {
          if (c.error || !c.comments) return;
          setDrawer((d) =>
            d && String(d.record.lead_id) === leadId
              ? { ...d, record: { ...d.record, lead_comments: c.comments, __newComment: "" } }
              : d
          );
        });
      }
      refresh();
      return;
    }

    setDrawer(null);
    refresh();
  };

  const onDelete = async (rec: Rec) => {
    const res = await deleteRecord({ tab, id: String(rec.id) });
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    setDrawer(null);
    refresh();
  };

  if (notAllowed) {
    return (
      <div className="app-gate">This tab is not visible to your role.</div>
    );
  }

  // Client search within fetched rows
  const allRows = rows || [];
  const q = app.query.trim().toLowerCase();
  const filtered = q
    ? allRows.filter((r) =>
        Object.values(r).some(
          (v) => !isBlank(v) && typeof v !== "object" && String(v).toLowerCase().includes(q)
        )
      )
    : allRows;

  // OPS accuracy banner (from visible rows, like the prototype)
  const opsBanner = tab === "ops" ? (() => {
    const reviewed = allRows.filter((r) => r.accuracy_review === "Pass" || r.accuracy_review === "Fail");
    const passes = reviewed.filter((r) => r.accuracy_review === "Pass").length;
    const fails = reviewed.length - passes;
    const acc = reviewed.length ? Math.round((passes / reviewed.length) * 1000) / 10 : null;
    const met = acc === null || acc >= 95;
    return { reviewed: reviewed.length, passes, fails, acc, met };
  })() : null;

  return (
    <div className="app-page">
      {opsBanner ? (
        <div
          className="crm-card"
          style={{
            marginBottom: 14,
            background: C.surface,
            border: `1px solid ${opsBanner.met ? C.line : TONES.bad.fg}`,
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            className={opsBanner.met ? "" : "kpi-glow"}
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: opsBanner.acc === null ? C.lineSoft : opsBanner.met ? TONES.good.bg : TONES.bad.bg,
              color: opsBanner.acc === null ? C.inkFaint : opsBanner.met ? TONES.good.fg : TONES.bad.fg,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            {opsBanner.acc === null ? "-" : opsBanner.met ? "\u2713" : "\u2717"}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.inkSoft,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              OPS QA Accuracy &middot; {app.tf} &middot; target &ge; 95%
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
              <span
                className="mono"
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: opsBanner.acc === null ? C.inkFaint : opsBanner.met ? TONES.good.fg : TONES.bad.fg,
                }}
              >
                {opsBanner.acc === null ? "No checks" : opsBanner.acc + "%"}
              </span>
              <span style={{ fontSize: 12.5, color: C.inkSoft }}>
                {opsBanner.reviewed
                  ? `${opsBanner.passes} passed, ${opsBanner.fails} crossed out of ${opsBanner.reviewed} checked`
                  : "No leads flagged to check in this period"}
              </span>
            </div>
          </div>
          {!opsBanner.met ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: TONES.bad.fg }}>
              <AlertTriangle size={16} /> Below target
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          overflow: "hidden",
          maxWidth: "100%",
          boxShadow: "0 12px 34px rgba(46,4,10,0.30)",
        }}
      >
        {loading ? (
          <div style={{ padding: "70px 24px", textAlign: "center", color: C.inkSoft, fontWeight: 600 }}>
            Loading&hellip;
          </div>
        ) : (
          <DataTable
            fields={fields}
            rows={filtered}
            onRow={(r) => setDrawer({ record: r, isNew: false })}
            rowTone={
              tab === "msp"
                ? (r) => (mspIsFatal(r) ? TONES.bad.bg : null)
                : tab === "leadgen"
                  ? (r) => (r.duplicate_of ? TONES.dup.bg : null)
                  : undefined
            }
            onAdd={canEdit && ADDABLE.includes(tab) ? openAdd : undefined}
            addLabel={"Add " + (tabDef.singular || "Row")}
          />
        )}
      </div>

      {drawer ? (
        <Drawer
          tab={tabDef}
          fields={fields}
          record={drawer.record}
          isNew={drawer.isNew}
          opts={app.opts}
          readOnly={
            !canEdit ||
            // Lead Gen agents may create, but cannot edit an existing lead's fields
            (tab === "leadgen" && app.role.key === "lg_agent" && !drawer.isNew)
          }
          manager={app.isManager}
          canDelete={app.canDelete}
          viewTabs={app.viewTabs}
          ownerLock={ownerLock}
          onClose={() => setDrawer(null)}
          onSave={onSave}
          onDelete={onDelete}
          allowComment={
            PIPELINE_COMMENT_TABS.includes(tab) && !!drawer.record.lead_id && !drawer.isNew
          }
          onAddComment={async (body) => {
            const leadId = String(drawer.record.lead_id);
            const prev = Array.isArray(drawer.record.lead_comments)
              ? (drawer.record.lead_comments as LeadComment[])
              : [];
            // Optimistic: show instantly, keep drawer open
            const optimistic: LeadComment = {
              id: `local-${Date.now()}`,
              lead_id: leadId,
              author: app.session.profile.full_name,
              body,
              created_at: new Date().toISOString(),
            };
            setDrawer({
              record: {
                ...drawer.record,
                lead_comments: [...prev, optimistic],
                __newComment: "",
              },
              isNew: false,
            });
            const res = await addLeadComment({ leadId, body });
            if (res.error) {
              app.pushToasts([res.error]);
              setDrawer({
                record: { ...drawer.record, lead_comments: prev, __newComment: body },
                isNew: false,
              });
              return;
            }
            const next = res.comment ? [...prev, res.comment] : [...prev, optimistic];
            setDrawer({
              record: { ...drawer.record, lead_comments: next, __newComment: "" },
              isNew: false,
            });
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
