"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { isBlank, today } from "@/lib/format";
import { CLOSER_REQUIRED_FIELDS, isCloserClosedStage } from "@/lib/schemas";
import { SCHEMAS, TAB_TABLE, mspIsFatal } from "@/lib/schemas";
import {
  TABS,
  ADDABLE,
  OWNER_FIELD,
  QA_DECISIONS,
  isLiveTransferSource,
  type TabKey,
} from "@/lib/constants";
import type { Rec } from "@/lib/types";
import { useApp } from "@/components/app-context";
import DataTable from "@/components/DataTable";
import Drawer from "@/components/Drawer";
import TablePager from "@/components/TablePager";
import DisputePanel from "@/components/DisputePanel";
import { createClient } from "@/lib/supabase/client";
import {
  fetchRows,
  fetchRowsTotal,
  fetchRowByLeadId,
  fetchOpsAccuracyStats,
  saveRecord,
  deleteRecord,
  createManualOpsRecord,
  createManualCloserRecord,
  fetchTabCounts,
  addLeadComment,
  fetchLeadComments,
} from "@/actions/data";
import { openDispute } from "@/actions/disputes";
import { openOpsDispute } from "@/actions/ops-disputes";
import { saveLeadNotes } from "@/actions/lead-notes";
import type { LeadComment } from "@/lib/types";
import {
  getPipelineCache,
  invalidatePipelineCache,
  pipelineCacheKey,
  setPipelineCache,
  touchPipelineCacheTotal,
} from "@/lib/pipeline-cache";

/** Fixed page size — table grows with rows (page scrolls); no empty minHeight gap. */
const PAGE_SIZE = 50;
/** Don't hard-refresh on every window focus — only if data is this stale. */
const FOCUS_REFRESH_MIN_MS = 30_000;
/** Background (realtime) refetch debounce — leads table is busy team-wide. */
const LIVE_REFRESH_DEBOUNCE_MS = 2500;

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
  if (tab === "closer") {
    return {
      ...base,
      lead_source: "Cold Calling",
      closer_lead_source: "Referral",
      business_name: "",
      dba_name: "",
      business_type: "",
      business_category: "",
      first_name: "",
      last_name: "",
      owner_name: "",
      phone: "",
      mobile_phone: "",
      email: "",
      monthly_volume: "",
      avg_ticket_size: "",
      highest_ticket_size: "",
      tin_ein: "",
      ssn: "",
      processing_type: "",
      processing_rate: "",
      provider: "",
      equipment: "",
      lease_amount: "",
      lease_term: "",
      business_address: "",
      city: "",
      zip_code: "",
      state: "",
      shipping_address: "",
      residential_address: "",
      assigned_date: today(),
      closer: "",
      stage: "No Answer",
      notes: "",
      attachments: [],
    };
  }
  return base;
}

export default function PipelinePage({ tab }: { tab: TabKey }) {
  const app = useApp();
  const tabDef = TABS.find((t) => t.k === tab)!;
  const fields = SCHEMAS[tab] || [];

  const [rows, setRows] = useState<Rec[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = PAGE_SIZE;
  const [searchQ, setSearchQ] = useState("");
  /** QA tab: "" = all, else Pending | Qualified | Disqualified. */
  const [qaDecisionFilter, setQaDecisionFilter] = useState("");
  /** True only for intentional page/search/tf fetches — not silent live sync. */
  const [pageFetching, setPageFetching] = useState(false);
  const [opsBanner, setOpsBanner] = useState<{
    reviewed: number;
    passes: number;
    fails: number;
    acc: number | null;
    met: boolean;
  } | null>(null);
  const [drawer, setDrawer] = useState<{ record: Rec; isNew: boolean } | null>(null);
  const tableShellRef = useRef<HTMLDivElement>(null);
  const fetchGen = useRef(0);
  const lastFetchAt = useRef(0);
  const refreshRef = useRef<(opts?: { silent?: boolean }) => Promise<void>>(async () => {});
  const silentInFlight = useRef(false);
  const silentQueued = useRef(false);

  const canEdit = app.editTabs.includes(tab);
  const notAllowed = !app.viewTabs.includes(tab);
  const pageSizeReady = true;
  const initialLoading = rows === null;

  const pushToasts = app.pushToasts;
  const setCounts = app.setCounts;
  const viewTabs = app.viewTabs;
  const tf = app.tf;

  // Debounce header search → server `q`
  useEffect(() => {
    const t = setTimeout(() => {
      const next = app.query.trim();
      setSearchQ((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [app.query]);

  // Reset page when tab / timeframe / QA filter changes — restore cache instantly if warm.
  useEffect(() => {
    setPage(1);
    if (tab !== "qa") setQaDecisionFilter("");
    const key = pipelineCacheKey(tab, tf, 1, pageSize, searchQ, qaDecisionFilter);
    const hit = getPipelineCache(key);
    if (hit) {
      setRows(hit.rows);
      setTotal(hit.total);
    } else {
      setRows(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pageSize/search handled in fetch effect
  }, [tab, tf, qaDecisionFilter]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!pageSizeReady) return;
      const silent = !!opts?.silent;
      if (silent) {
        if (silentInFlight.current) {
          silentQueued.current = true;
          return;
        }
        silentInFlight.current = true;
      }
      const gen = ++fetchGen.current;
      if (!silent) setPageFetching(true);
      try {
        const res = await fetchRows({
          tab,
          tf,
          page,
          pageSize,
          q: searchQ || undefined,
          qaDecision: tab === "qa" ? qaDecisionFilter || undefined : undefined,
          skipCount: silent,
        });
        if (gen !== fetchGen.current) return;
        if (res.error) {
          if (!silent) pushToasts([res.error]);
          setPageFetching(false);
          return;
        }
        setRows(res.rows);
        let nextTotal = 0;
        setTotal((prev) => {
          nextTotal = res.keepTotal ? prev : res.total;
          const maxPage = Math.max(1, Math.ceil(nextTotal / pageSize) || 1);
          if (page > maxPage) setPage(maxPage);
          return nextTotal;
        });
        setPipelineCache(
          pipelineCacheKey(tab, tf, page, pageSize, searchQ, qaDecisionFilter),
          res.rows,
          nextTotal || res.rows.length
        );
        lastFetchAt.current = Date.now();
        setPageFetching(false);
        if (!silent) {
          fetchTabCounts({ tf, tabs: viewTabs }).then((c) => setCounts(c));
          if (tab === "ops") {
            fetchOpsAccuracyStats({ tf }).then((s) => {
              if (!s.error) setOpsBanner(s);
            });
          } else {
            setOpsBanner(null);
          }
        } else {
          // After save / live sync: refresh only the dirty tab badge
          fetchTabCounts({ tf, tabs: [tab] }).then((c) =>
            setCounts((prev) => ({ ...prev, ...c }))
          );
        }
      } finally {
        if (silent) {
          silentInFlight.current = false;
          if (silentQueued.current) {
            silentQueued.current = false;
            void refreshRef.current({ silent: true });
          }
        }
      }
    },
    [tab, tf, page, pageSize, pageSizeReady, searchQ, qaDecisionFilter, pushToasts, setCounts, viewTabs]
  );

  refreshRef.current = refresh;

  useEffect(() => {
    if (notAllowed || !pageSizeReady) return;
    const key = pipelineCacheKey(tab, tf, page, pageSize, searchQ, qaDecisionFilter);
    const hit = getPipelineCache(key);
    if (hit) {
      setRows(hit.rows);
      setTotal(hit.total);
      lastFetchAt.current = hit.at;
    }

    const gen = ++fetchGen.current;
    // Only flash the loader when we have nothing cached to show.
    if (!hit) setPageFetching(true);

    // Skip COUNT(*) on first paint — pager total fills in right after.
    fetchRows({
      tab,
      tf,
      page,
      pageSize,
      q: searchQ || undefined,
      qaDecision: tab === "qa" ? qaDecisionFilter || undefined : undefined,
      skipCount: true,
    }).then((res) => {
      if (gen !== fetchGen.current) return;
      if (res.error) pushToasts([res.error]);
      setRows(res.rows);
      setPipelineCache(key, res.rows, hit?.total ?? res.rows.length);
      lastFetchAt.current = Date.now();
      setPageFetching(false);

      void fetchRowsTotal({
        tab,
        tf,
        q: searchQ || undefined,
        qaDecision: tab === "qa" ? qaDecisionFilter || undefined : undefined,
      }).then((c) => {
        if (gen !== fetchGen.current || c.error) return;
        setTotal(c.total);
        touchPipelineCacheTotal(key, c.total);
      });
    });
    if (tab === "ops") {
      fetchOpsAccuracyStats({ tf }).then((s) => {
        if (gen === fetchGen.current && !s.error) setOpsBanner(s);
      });
    } else {
      setOpsBanner(null);
    }
  }, [tab, tf, page, pageSize, pageSizeReady, searchQ, qaDecisionFilter, notAllowed, pushToasts]);

  const changePage = useCallback((next: number) => {
    setPage(next);
    tableShellRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const openRecord = useCallback(
    (r: Rec) => {
      setDrawer({ record: { ...r, lead_comments: r.lead_comments || [] }, isNew: false });
      const leadId = String(r.lead_id || "");
      if (!leadId) return;

      // List fetch is light — load full row / comments on open.
      if (
        tab === "leadgen" ||
        tab === "closer" ||
        tab === "ops" ||
        tab === "documentation" ||
        tab === "retention"
      ) {
        fetchRowByLeadId({ tab, leadId }).then((res) => {
          if (!res.row) return;
          setDrawer((d) =>
            d && !d.isNew && String(d.record.lead_id) === leadId
              ? { ...d, record: res.row! }
              : d
          );
          // Cross-page duplicate mark (list only checks the current page).
          if (tab === "leadgen" && res.row.duplicate_of) {
            setRows((prev) =>
              prev
                ? prev.map((row) =>
                    String(row.lead_id) === leadId
                      ? { ...row, duplicate_of: res.row!.duplicate_of }
                      : row
                  )
                : prev
            );
          }
        });
        return;
      }

      if (!PIPELINE_COMMENT_TABS.includes(tab)) return;
      fetchLeadComments({ leadId }).then((c) => {
        if (c.error) return;
        setDrawer((d) =>
          d && !d.isNew && String(d.record.lead_id) === leadId
            ? { ...d, record: { ...d.record, lead_comments: c.comments } }
            : d
        );
      });
    },
    [tab]
  );

  // Live list: silent refetch — no full-screen preloader flash.
  useEffect(() => {
    if (notAllowed) return;
    const table = TAB_TABLE[tab];
    if (!table || table === "profiles") return;

    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleSilentRefresh = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refreshRef.current({ silent: true });
      }, LIVE_REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`pipeline-${tab}-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        scheduleSilentRefresh
      )
      .subscribe();

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchAt.current < FOCUS_REFRESH_MIN_MS) return;
      scheduleSilentRefresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [tab, notAllowed]);

  // Deep-link: open record on current page, else fetch by lead_id.
  const pendingOpen = app.pendingOpen;
  const clearPendingOpen = app.clearPendingOpen;
  useEffect(() => {
    if (!rows || !pendingOpen || pendingOpen.tab !== tab) return;
    const leadId = pendingOpen.leadId;
    const rec = rows.find((r) => r.lead_id === leadId);
    clearPendingOpen();
    if (rec) {
      openRecord(rec);
      return;
    }
    fetchRowByLeadId({ tab, leadId }).then((res) => {
      if (res.row) openRecord(res.row);
      else pushToasts([`${leadId} is not visible on this tab.`]);
    });
  }, [rows, pendingOpen, tab, clearPendingOpen, pushToasts, openRecord]);

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
    // AVP / Sales Head creating on Closer: default owner to self (can change in form)
    if (
      tab === "closer" &&
      ["avp_sales", "sales_head", "ceo", "super_admin"].includes(app.role.key)
    ) {
      rec.closer = app.session.profile.full_name;
    }
    setDrawer({ record: rec, isNew: true });
  }, [tab, ownerField, ownerValue, app.role.key, app.session.profile.full_name]);

  // Header "Add" button
  useEffect(() => {
    if (!(canEdit && ADDABLE.includes(tab))) return;
    return app.onAdd(openAdd);
  }, [app, canEdit, tab, openAdd]);

  const onSave = async (draft: Rec, isNew: boolean) => {
    // Client-side guards, mirrored from the prototype (DB enforces them too)
    if (tab === "qa" && draft.qa_decision === "Qualified") {
      // Monthly volume is informational only — any amount can Qualify / Disqualify.
      const checks = ["us_business", "owner_reached", "interested", "physical_loc", "not_restricted"];
      const fails = checks.filter((k) => draft[k] !== "Yes");
      if (fails.length) {
        app.pushToasts(["Cannot qualify: the 5 Yes/No checks must all be Yes. Monthly volume does not matter."]);
        return;
      }
    }
    if (tab === "closer" && isCloserClosedStage(draft.stage)) {
      const missing = CLOSER_REQUIRED_FIELDS.filter((f) => isBlank(draft[f.k])).map((f) => f.label);
      if (missing.length) {
        app.pushToasts([
          `Closed requires all fields (*): ${missing.slice(0, 6).join(", ")}${
            missing.length > 6 ? ` +${missing.length - 6} more` : ""
          }.`,
        ]);
        return;
      }
    }
    if (tab === "closer" && draft.stage === "Closed Lost" && isBlank(draft.lost_reason)) {
      app.pushToasts(["Closed Lost needs a reason."]);
      return;
    }
    if (tab === "documentation" && draft.decision === "Fail" && isBlank(draft.fail_reason)) {
      app.pushToasts(["Fail needs a reason."]);
      return;
    }
    if (tab === "ops" && draft.ops_status === "Rework" && isBlank(draft.reasoning)) {
      app.pushToasts(["Rework needs a reasoning."]);
      return;
    }
    if (tab === "ops" && draft.ops_status === "Approved") {
      if (draft.dl_recd !== "Yes" || draft.voided_check !== "Yes") {
        app.pushToasts(["Approve needs DL Recd and Voided Cheque both set to Yes."]);
        return;
      }
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
    } else if (isNew && tab === "closer") {
      if (
        app.role.key !== "closer" &&
        isBlank(values.closer) &&
        app.session.profile.full_name
      ) {
        values.closer = app.session.profile.full_name;
      }
      if (app.role.key !== "closer" && isBlank(values.closer)) {
        app.pushToasts(["Select a Closer before creating this lead."]);
        return;
      }
      res = await createManualCloserRecord({ values });
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

    setDrawer(null);
    invalidatePipelineCache(tab);
    refresh();
  };

  const onDelete = async (rec: Rec) => {
    const res = await deleteRecord({ tab, id: String(rec.id) });
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    setDrawer(null);
    invalidatePipelineCache(tab);
    refresh();
  };

  if (notAllowed) {
    return (
      <div className="app-gate">This tab is not visible to your role.</div>
    );
  }

  const pageRows = rows || [];

  return (
    <div className="app-page">
      {tab === "ops" && opsBanner ? (
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

      {tab === "leadgen" && app.role.key === "lg_sup" ? (
        <DisputePanel variant="qa" onChanged={() => void refresh()} />
      ) : null}

      {tab === "closer" &&
      (app.role.key === "avp_sales" ||
        app.role.key === "sales_head" ||
        app.role.key === "ceo" ||
        app.role.key === "super_admin") ? (
        <DisputePanel variant="ops" onChanged={() => void refresh()} />
      ) : null}

      {tab === "qa" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <label
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: C.inkSoft,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            QA Decision
          </label>
          <select
            className="app-control"
            value={qaDecisionFilter}
            onChange={(e) => {
              setQaDecisionFilter(e.target.value);
              setPage(1);
            }}
            title="Filter by QA decision"
            aria-label="Filter by QA decision"
            style={{ minWidth: 160 }}
          >
            <option value="">All decisions</option>
            {QA_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div
        ref={tableShellRef}
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          overflow: "hidden",
          maxWidth: "100%",
          boxShadow: "0 12px 34px rgba(46,4,10,0.30)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {initialLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: "72px 24px",
              minHeight: 240,
              color: C.inkSoft,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(180deg,#f8ecec,#fff)",
                border: `1px solid ${C.line}`,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 8px 20px rgba(46,4,10,0.08)",
              }}
            >
              <Loader2 size={22} className="spin" style={{ color: C.blue }} />
            </div>
            <div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>
              Loading {tabDef.label}…
            </div>
            <div style={{ fontSize: 12.5, color: C.inkFaint }}>Fetching records for this view</div>
          </div>
        ) : (
          <>
            <div style={{ position: "relative", overflowX: "auto" }}>
              {pageFetching && pageRows.length === 0 ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    background: "rgba(255,255,255,0.55)",
                    minHeight: 180,
                  }}
                >
                  <Loader2 size={22} className="spin" style={{ color: C.blue }} />
                  <div style={{ fontSize: 12.5, color: C.inkFaint }}>Loading records…</div>
                </div>
              ) : null}
              <DataTable
                fields={fields}
                rows={pageRows}
                onRow={openRecord}
                rowTone={
                  tab === "msp"
                    ? (r) => (mspIsFatal(r) ? TONES.bad.bg : null)
                    : tab === "leadgen"
                      ? (r) => (r.duplicate_of ? TONES.dup.bg : null)
                      : tab === "qa"
                        ? (r) =>
                            isLiveTransferSource(r.lead_source)
                              ? "#F8C8CB"
                              : r.returned_after_dispute
                                ? TONES.info.bg
                                : null
                        : tab === "sqlassign"
                          ? (r) => (isLiveTransferSource(r.lead_source) ? "#F8C8CB" : null)
                          : tab === "closer"
                            ? (r) =>
                                isLiveTransferSource(r.closer_lead_source) ||
                                isLiveTransferSource(r.lead_source)
                                  ? "#F8C8CB"
                                  : null
                          : tab === "documentation"
                            ? (r) => (r.returned_after_ops_rework ? "#F8C8CB" : null)
                            : undefined
                }
                onAdd={canEdit && ADDABLE.includes(tab) ? openAdd : undefined}
                addLabel={"Add " + (tabDef.singular || "Row")}
              />
            </div>
            <TablePager
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={changePage}
              loading={pageFetching}
            />
          </>
        )}
      </div>

      {drawer ? (
        <Drawer
          tab={tabDef}
          fields={fields}
          record={drawer.record}
          isNew={drawer.isNew}
          opts={
            tab === "closer"
              ? {
                  ...app.opts,
                  closers: [
                    ...new Set(
                      [
                        ...app.opts.closers,
                        // Only when creating: managers may assign the deal to themselves
                        ...(drawer.isNew &&
                        ["avp_sales", "sales_head", "ceo", "super_admin"].includes(app.role.key)
                          ? [String(app.session.profile.full_name || "").trim()]
                          : []),
                        // Keep current owner visible even if title changed
                        String(drawer.record.closer || "").trim(),
                      ].filter(Boolean)
                    ),
                  ],
                }
              : app.opts
          }
          readOnly={
            !canEdit ||
            // Lead Gen agents may create, but cannot edit an existing lead's fields
            (tab === "leadgen" && app.role.key === "lg_agent" && !drawer.isNew)
          }
          manager={app.isManager}
          canDelete={app.canDelete}
          viewTabs={app.viewTabs}
          ownerLock={
            // Substitute must not overwrite the primary agent_name on open
            tab === "retention" &&
            !drawer.isNew &&
            String(drawer.record.agent_name || "") !== app.session.profile.full_name &&
            String(drawer.record.substitute || "") === app.session.profile.full_name
              ? null
              : ownerLock
          }
          onClose={() => setDrawer(null)}
          onSave={onSave}
          onDelete={onDelete}
          disputeKind={tab === "closer" ? "ops" : "qa"}
          canDispute={
            !drawer.isNew &&
            ((tab === "leadgen" &&
              app.role.key === "lg_agent" &&
              String(drawer.record.qa_outcome || "") === "Disqualified" &&
              String(drawer.record.dispute_status || "") !== "open") ||
              (tab === "closer" &&
                app.role.key === "closer" &&
                String(drawer.record.ops_status || "") === "Disapproved" &&
                String(drawer.record.ops_dispute_status || "") !== "open"))
          }
          onOpenDispute={async (reason) => {
            const leadId = String(drawer.record.lead_id || "");
            if (tab === "closer") {
              const res = await openOpsDispute({ leadId, reason });
              if (res.error) {
                app.pushToasts([res.error]);
                return;
              }
              app.pushToasts(["OPS dispute submitted to AVP Sales."]);
              setDrawer({
                record: {
                  ...drawer.record,
                  ops_dispute_status: "open",
                  ops_dispute_reason: reason,
                },
                isNew: false,
              });
              refresh();
              return;
            }
            const res = await openDispute({ leadId, reason });
            if (res.error) {
              app.pushToasts([res.error]);
              return;
            }
            app.pushToasts(["Dispute submitted to your supervisor."]);
            setDrawer({
              record: {
                ...drawer.record,
                dispute_status: "open",
                dispute_reason: reason,
              },
              isNew: false,
            });
            refresh();
          }}
          extraEditableKeys={
            tab === "leadgen" &&
            (app.role.key === "lg_agent" || app.role.key === "lg_sup") &&
            !drawer.isNew
              ? ["notes"]
              : undefined
          }
          onSaveNotes={
            tab === "leadgen" &&
            (app.role.key === "lg_agent" || app.role.key === "lg_sup") &&
            !drawer.isNew
              ? async (notes) => {
                  const leadId = String(drawer.record.lead_id || "");
                  const res = await saveLeadNotes({ leadId, notes });
                  if (res.error) {
                    app.pushToasts([res.error]);
                    return;
                  }
                  app.pushToasts(["Notes saved — visible to QA."]);
                  setDrawer({
                    record: { ...drawer.record, notes },
                    isNew: false,
                  });
                  setRows((prev) =>
                    prev
                      ? prev.map((r) =>
                          String(r.lead_id) === leadId ? { ...r, notes } : r
                        )
                      : prev
                  );
                }
              : undefined
          }
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
