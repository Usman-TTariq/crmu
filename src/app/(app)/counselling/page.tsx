"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart, RefreshCw, UserRoundSearch, X } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { money } from "@/lib/format";
import { useApp } from "@/components/app-context";
import { Stat, Panel, Bar, StackedBar, Donut } from "@/components/dash";
import {
  fetchCounsellingRoster,
  fetchCounsellingTeamSummary,
  fetchCounsellingPersonJourney,
  fetchCounsellingPersonWork,
  type CounsellingRosterRow,
  type CounsellingTeamSummary,
  type CounsellingPersonJourney,
  type CounsellingWorkKind,
  type CounsellingWorkItem,
} from "@/actions/counselling";
import type { TabKey } from "@/lib/constants";

/** Tall boards so more rows show before scroll. */
const BOARD_BODY: React.CSSProperties = {
  height: 420,
  overflowY: "auto",
  overflowX: "hidden",
  padding: "2px 2px 4px",
  boxSizing: "border-box",
};

/** People + journey share this height; journey scrolls inside. */
const SPLIT_PANEL_H = 720;

const WORK_META: Record<
  CounsellingWorkKind,
  { title: string; openTab: TabKey; empty: string }
> = {
  leads: {
    title: "Leads created",
    openTab: "leadgen",
    empty: "No leads created by this person since Day 1.",
  },
  qa: {
    title: "QA decisions",
    openTab: "qa",
    empty: "No QA qualifications / disqualifications since Day 1.",
  },
  closer: {
    title: "Closer deals",
    openTab: "closer",
    empty: "No closer deals assigned / closed since Day 1.",
  },
  docs: {
    title: "Documentation reviews",
    openTab: "documentation",
    empty: "No documentation reviews since Day 1.",
  },
  ops: {
    title: "OPS QA decisions",
    openTab: "ops",
    empty: "No OPS approvals / disapprovals since Day 1.",
  },
  onboard: {
    title: "Onboarding cases",
    openTab: "msp",
    empty: "No onboarding cases since Day 1.",
  },
  cs: {
    title: "Customer Success cases",
    openTab: "retention",
    empty: "No CS cases since Day 1.",
  },
};

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function workSummaryLine(kind: CounsellingWorkKind, item: CounsellingWorkItem): string {
  if (kind === "qa") {
    return [
      str(item.qa_date).slice(0, 10),
      str(item.qa_decision),
      str(item.owner_name),
      str(item.phone),
      `LG ${str(item.lead_gen_agent)}`,
    ].join(" · ");
  }
  if (kind === "closer") {
    return [
      str(item.assigned_date).slice(0, 10),
      str(item.stage),
      str(item.owner_name),
      str(item.phone),
      `Vol ${money(item.monthly_volume)}`,
    ].join(" · ");
  }
  if (kind === "docs") {
    return [
      str(item.review_date).slice(0, 10),
      str(item.decision),
      str(item.closer),
      str(item.phone),
    ].join(" · ");
  }
  if (kind === "ops") {
    return [
      str(item.ops_date).slice(0, 10),
      str(item.ops_status),
      str(item.brand),
      str(item.phone),
    ].join(" · ");
  }
  if (kind === "onboard") {
    return [
      str(item.final_status),
      `A1 ${str(item.a1_result)}`,
      `A2 ${str(item.a2_result)}`,
      `A3 ${str(item.a3_result)}`,
    ].join(" · ");
  }
  if (kind === "cs") {
    return [str(item.status), str(item.agent_name), str(item.substitute)].join(" · ");
  }
  return [
    str(item.date_created).slice(0, 10),
    str(item.owner_name),
    str(item.phone),
    `QA: ${str(item.qa_outcome)}`,
    `Vol ${money(item.monthly_volume)}`,
  ].join(" · ");
}

function workDetailPairs(
  kind: CounsellingWorkKind,
  item: CounsellingWorkItem
): [string, string][] {
  const base: [string, string][] = [
    ["Lead ID", str(item.lead_id)],
    ["Business", str(item.business_name)],
  ];
  if (kind === "leads") {
    return [
      ...base,
      ["Date created", str(item.date_created).slice(0, 10)],
      ["Source", str(item.lead_source)],
      ["Owner", str(item.owner_name)],
      ["Phone", str(item.phone)],
      ["Email", str(item.email)],
      ["Address", str(item.business_address)],
      ["City / State / Zip", [item.city, item.state, item.zip_code].filter(Boolean).join(", ") || "—"],
      ["Processor", str(item.current_processor)],
      ["Device", str(item.current_device)],
      ["Rate", item.current_rate ? `${item.current_rate}%` : "—"],
      ["Monthly volume", money(item.monthly_volume)],
      ["QA outcome", str(item.qa_outcome)],
      ["Notes", str(item.notes)],
    ];
  }
  if (kind === "qa") {
    return [
      ...base,
      ["QA date", str(item.qa_date).slice(0, 10)],
      ["Decision", str(item.qa_decision)],
      ["Lead Gen", str(item.lead_gen_agent)],
      ["Owner", str(item.owner_name)],
      ["Phone", str(item.phone)],
      ["Email", str(item.email)],
      ["Volume", money(item.monthly_volume)],
      ["US business", str(item.us_business)],
      ["Owner reached", str(item.owner_reached)],
      ["Interested", str(item.interested)],
      ["Physical loc", str(item.physical_loc)],
      ["Not restricted", str(item.not_restricted)],
      ["Lead notes", str(item.notes)],
      ["QA notes", str(item.qa_notes)],
    ];
  }
  if (kind === "closer") {
    return [
      ...base,
      ["Assigned", str(item.assigned_date).slice(0, 10)],
      ["Closed", str(item.closed_date).slice(0, 10)],
      ["Stage", str(item.stage)],
      ["Owner", str(item.owner_name)],
      ["Phone", str(item.phone)],
      ["Volume", money(item.monthly_volume)],
      ["Lost reason", str(item.lost_reason)],
      ["Notes", str(item.notes)],
    ];
  }
  if (kind === "docs") {
    return [
      ...base,
      ["Review date", str(item.review_date).slice(0, 10)],
      ["Decision", str(item.decision)],
      ["Closer", str(item.closer)],
      ["Fail reason", str(item.fail_reason)],
      ["Notes", str(item.notes)],
    ];
  }
  if (kind === "ops") {
    return [
      ...base,
      ["OPS date", str(item.ops_date).slice(0, 10)],
      ["Status", str(item.ops_status)],
      ["Brand", str(item.brand)],
      ["Closer", str(item.closer)],
      ["Accuracy", str(item.accuracy_review)],
      ["Reasoning", str(item.reasoning)],
      ["Notes", str(item.notes)],
    ];
  }
  if (kind === "onboard") {
    return [
      ...base,
      ["Final status", str(item.final_status)],
      ["A1 / A2 / A3", `${str(item.a1_result)} / ${str(item.a2_result)} / ${str(item.a3_result)}`],
      ["Device", str(item.device)],
      ["Tracking", str(item.tracking_number)],
      ["Final reasoning", str(item.final_reasoning)],
      ["Notes", str(item.notes)],
    ];
  }
  return [
    ...base,
    ["Status", str(item.status)],
    ["Agent", str(item.agent_name)],
    ["Substitute", str(item.substitute)],
    ["Team", str(item.team)],
    ["Handover notes", str(item.handover_notes)],
  ];
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 48) return `${Math.round(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function weekLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso.slice(0, 10) + "T00:00:00Z"));
  } catch {
    return iso.slice(0, 10);
  }
}

function monthLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }).format(new Date(iso.slice(0, 10) + "T00:00:00Z"));
  } catch {
    return iso.slice(0, 7);
  }
}

function roleBucket(roleKey: string): "lg" | "qa" | "closer" | "other" {
  if (roleKey === "lg_agent" || roleKey === "lg_sup") return "lg";
  if (roleKey === "qa_agent") return "qa";
  if (roleKey === "closer") return "closer";
  return "other";
}

function WorkDetailRows({
  kind,
  item,
}: {
  kind: CounsellingWorkKind;
  item: CounsellingWorkItem;
}) {
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      {workDetailPairs(kind, item).map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: C.inkSoft }}>{k}</span>
          <span style={{ fontWeight: 600, color: C.ink, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CounsellingPage() {
  const app = useApp();
  const router = useRouter();
  const [roster, setRoster] = useState<CounsellingRosterRow[]>([]);
  const [summary, setSummary] = useState<CounsellingTeamSummary | null>(null);
  const [journey, setJourney] = useState<CounsellingPersonJourney | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [workKind, setWorkKind] = useState<CounsellingWorkKind | null>(null);
  const [workItems, setWorkItems] = useState<CounsellingWorkItem[]>([]);
  const [workLoading, setWorkLoading] = useState(false);
  const [workFilter, setWorkFilter] = useState<"all" | "Qualified" | "Disqualified">("all");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [rRes, sRes] = await Promise.all([
      fetchCounsellingRoster(),
      fetchCounsellingTeamSummary({ tf: app.tf }),
    ]);
    if (rRes.error || sRes.error) {
      setErr(rRes.error || sRes.error || "Failed to load.");
    }
    setRoster(rRes.rows);
    setSummary(sRes.summary);
    setLoading(false);
    setSelectedId((prev) => {
      if (prev && rRes.rows.some((r) => r.id === prev)) return prev;
      return rRes.rows[0]?.id || null;
    });
  }, [app.tf]);

  useEffect(() => {
    if (!app.canSeeCounselling) return;
    void loadTeam();
  }, [app.canSeeCounselling, loadTeam]);

  useEffect(() => {
    if (!app.canSeeCounselling || !selectedId) {
      setJourney(null);
      return;
    }
    let alive = true;
    setJourneyLoading(true);
    setWorkKind(null);
    setWorkItems([]);
    setWorkFilter("all");
    setExpandedLead(null);
    fetchCounsellingPersonJourney({ profileId: selectedId }).then((res) => {
      if (!alive) return;
      if (res.error) setErr(res.error);
      setJourney(res.journey);
      setJourneyLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [app.canSeeCounselling, selectedId]);

  const openWork = async (kind: CounsellingWorkKind, profileId?: string) => {
    const pid = profileId || selectedId;
    if (!pid) return;
    setWorkKind(kind);
    setWorkFilter(kind === "qa" ? "Qualified" : "all");
    setExpandedLead(null);
    setWorkLoading(true);
    const res = await fetchCounsellingPersonWork({ profileId: pid, kind });
    setWorkLoading(false);
    if (res.error) {
      setErr(res.error);
      setWorkItems([]);
      return;
    }
    setWorkItems(res.items);
  };

  const visibleWorkItems = useMemo(() => {
    if (workKind !== "qa" || workFilter === "all") return workItems;
    return workItems.filter((i) => String(i.qa_decision || "") === workFilter);
  }, [workItems, workKind, workFilter]);

  const filteredRoster = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return roster;
    return roster.filter(
      (r) =>
        r.full_name.toLowerCase().includes(qq) ||
        r.title.toLowerCase().includes(qq) ||
        r.team.toLowerCase().includes(qq) ||
        r.role_key.toLowerCase().includes(qq)
    );
  }, [roster, q]);

  const byPerson = summary?.by_person || [];
  const maxLeads = Math.max(1, ...byPerson.map((p) => p.leads || 0));
  const maxQaQ = Math.max(1, ...byPerson.map((p) => p.qa_q || 0));
  const maxWins = Math.max(1, ...byPerson.map((p) => p.wins || 0));
  const maxWorkHours = Math.max(
    1,
    ...byPerson.map((p) => Math.round(Number(p.working_seconds || 0) / 3600))
  );

  const selectPersonByName = (name: string, openKind?: CounsellingWorkKind) => {
    const row = roster.find((r) => r.full_name === name);
    if (!row) return;
    const same = row.id === selectedId;
    setSelectedId(row.id);
    if (!openKind) return;
    if (same) {
      void openWork(openKind, row.id);
      return;
    }
    // Wait for person-change effect to clear the panel, then open this list.
    window.setTimeout(() => {
      void openWork(openKind, row.id);
    }, 400);
  };

  const qaTotal = (summary?.qa_qualified || 0) + (summary?.qa_disqualified || 0);
  const closerDecided = (summary?.closer_wins || 0) + (summary?.closer_lost || 0);

  const selected = roster.find((r) => r.id === selectedId) || null;
  const bucket = journey ? roleBucket(journey.role_key) : "other";

  const weekMax = Math.max(
    1,
    ...(journey?.output_weeks || []).map(
      (w) => (w.leads || 0) + (w.qa_q || 0) + (w.wins || 0)
    )
  );
  const dayAttendMax = Math.max(
    1,
    ...(journey?.attendance_days || []).map(
      (d) =>
        (d.working_seconds || 0) + (d.break_seconds || 0) + (d.away_seconds || 0)
    )
  );
  const monthAttendMax = Math.max(
    1,
    ...(journey?.attendance_months || []).map(
      (m) =>
        Number(m.working_seconds || 0) +
        Number(m.break_seconds || 0) +
        Number(m.away_seconds || 0)
    )
  );

  if (app.counsellingLocked) {
    return (
      <div className="app-gate">
        Performance Overview is locked for everyone right now.
      </div>
    );
  }

  if (!app.canSeeCounselling) {
    return (
      <div className="app-gate">
        Performance Overview is restricted to CEO / Super Admin / Sales Head.
      </div>
    );
  }

  return (
    <div className="app-page">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="app-page-head" style={{ marginBottom: 0 }}>
          <div className="app-page-title">
            <LineChart size={22} style={{ color: C.blue }} />
            Performance Overview
          </div>
          <div className="app-page-lede">
            Team sales + attendance overview · pick anyone for Day‑1 → today journey
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadTeam()}
          className="app-control"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {err ? (
        <div
          style={{
            marginBottom: 14,
            padding: "12px 14px",
            borderRadius: 12,
            background: TONES.bad.bg,
            color: TONES.bad.fg,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {err}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Stat label="People" value={summary?.people ?? "—"} sub={`Timeframe: ${app.tf}`} />
        <Stat
          label="Leads"
          value={loading ? "…" : summary?.leads ?? 0}
          sub="Lead Gen created"
          tone={C.blue}
        />
        <Stat
          label="QA qualified"
          value={loading ? "…" : summary?.qa_qualified ?? 0}
          sub={
            qaTotal
              ? `${Math.round(((summary?.qa_qualified || 0) / qaTotal) * 100)}% of decided`
              : "No QA decisions"
          }
          tone={TONES.good.fg}
        />
        <Stat
          label="Closer wins"
          value={loading ? "…" : summary?.closer_wins ?? 0}
          sub={
            closerDecided
              ? `${Math.round(((summary?.closer_wins || 0) / closerDecided) * 100)}% win rate`
              : "No closed deals"
          }
          tone={TONES.good.fg}
        />
        <Stat
          label="Working time"
          value={loading ? "…" : fmtDur(Number(summary?.working_seconds || 0))}
          sub={`Break ${fmtDur(Number(summary?.break_seconds || 0))} · Away ${fmtDur(Number(summary?.away_seconds || 0))}`}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          marginBottom: 14,
          alignItems: "start",
        }}
      >
        <Panel title="Team leads by person" color={C.blue}>
          <div style={BOARD_BODY}>
            {byPerson.filter((p) => p.leads > 0).length ? (
              byPerson
                .filter((p) => p.leads > 0)
                .sort((a, b) => b.leads - a.leads)
                .slice(0, 20)
                .map((p) => (
                  <button
                    key={p.name + "-leads"}
                    type="button"
                    onClick={() => selectPersonByName(p.name, "leads")}
                    style={{
                      display: "block",
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: "2px 0",
                      textAlign: "left",
                    }}
                  >
                    <Bar label={p.name} value={p.leads} max={maxLeads} color={C.blue} />
                  </button>
                ))
            ) : (
              <div style={{ color: C.inkSoft, fontSize: 13, fontWeight: 600 }}>
                No leads in this timeframe.
              </div>
            )}
          </div>
        </Panel>
        <Panel title="QA qualified by person" color={TONES.info.fg}>
          <div style={BOARD_BODY}>
            {byPerson.filter((p) => p.qa_q > 0 || p.qa_rej > 0).length ? (
              byPerson
                .filter((p) => p.qa_q > 0 || p.qa_rej > 0)
                .sort((a, b) => b.qa_q - a.qa_q || b.qa_rej - a.qa_rej)
                .slice(0, 20)
                .map((p) => {
                  const decided = (p.qa_q || 0) + (p.qa_rej || 0);
                  const rate = decided ? Math.round((p.qa_q / decided) * 100) : 0;
                  return (
                    <button
                      key={p.name + "-qa"}
                      type="button"
                      onClick={() => selectPersonByName(p.name, "qa")}
                      style={{
                        display: "block",
                        width: "100%",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        padding: "2px 0",
                        textAlign: "left",
                      }}
                    >
                      <Bar
                        label={`${p.name} · ${p.qa_q}Q / ${p.qa_rej}DQ (${rate}%)`}
                        value={p.qa_q}
                        max={maxQaQ}
                        color={TONES.info.fg}
                      />
                    </button>
                  );
                })
            ) : (
              <div style={{ color: C.inkSoft, fontSize: 13, fontWeight: 600 }}>
                No QA decisions in this timeframe.
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Closer wins by person" color={TONES.good.fg}>
          <div style={BOARD_BODY}>
            {byPerson.filter((p) => p.wins > 0).length ? (
              byPerson
                .filter((p) => p.wins > 0)
                .sort((a, b) => b.wins - a.wins)
                .slice(0, 20)
                .map((p) => (
                  <button
                    key={p.name + "-wins"}
                    type="button"
                    onClick={() => selectPersonByName(p.name, "closer")}
                    style={{
                      display: "block",
                      width: "100%",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      padding: "2px 0",
                      textAlign: "left",
                    }}
                  >
                    <Bar label={p.name} value={p.wins} max={maxWins} color={TONES.good.fg} />
                  </button>
                ))
            ) : (
              <div style={{ color: C.inkSoft, fontSize: 13, fontWeight: 600 }}>
                No wins in this timeframe.
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Working hours by person" color={TONES.info.fg}>
          <div style={BOARD_BODY}>
            {byPerson.filter((p) => Number(p.working_seconds) > 0).length ? (
              byPerson
                .filter((p) => Number(p.working_seconds) > 0)
                .sort((a, b) => Number(b.working_seconds) - Number(a.working_seconds))
                .slice(0, 20)
                .map((p) => (
                  <Bar
                    key={p.name + "-work"}
                    label={`${p.name} · ${fmtDur(Number(p.working_seconds))}`}
                    value={Math.round(Number(p.working_seconds) / 3600)}
                    max={maxWorkHours}
                    color={TONES.info.fg}
                    suffix=""
                  />
                ))
            ) : (
              <div style={{ color: C.inkSoft, fontSize: 13, fontWeight: 600 }}>
                No presence hours in this timeframe.
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Team mix" color={C.inkSoft}>
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 0",
            }}
          >
            <Donut
              value={qaTotal ? Math.round(((summary?.qa_qualified || 0) / qaTotal) * 100) : null}
              label="QA qualify"
              sub={qaTotal ? `${summary?.qa_qualified || 0} of ${qaTotal}` : "No decisions"}
              color={TONES.good.fg}
            />
            <Donut
              value={
                closerDecided
                  ? Math.round(((summary?.closer_wins || 0) / closerDecided) * 100)
                  : null
              }
              label="Win rate"
              sub={
                closerDecided
                  ? `${summary?.closer_wins || 0} of ${closerDecided}`
                  : "No closed deals"
              }
              color={C.blue}
            />
          </div>
        </Panel>
      </div>

      <div
        className="monitor-split"
        style={{
          display: "grid",
          gridTemplateColumns: selected ? "1.1fr 1.35fr" : "1fr",
          gap: 14,
          alignItems: "start",
        }}
      >
        <Panel
          title="People"
          style={{
            display: "flex",
            flexDirection: "column",
            height: SPLIT_PANEL_H,
            maxHeight: SPLIT_PANEL_H,
            boxSizing: "border-box",
          }}
          bodyStyle={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: "12px 10px",
          }}
          right={
            <span style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
              {filteredRoster.length} shown
            </span>
          }
        >
          <div style={{ padding: "0 4px", flexShrink: 0 }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <UserRoundSearch
                size={14}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: C.inkFaint,
                }}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, team, role…"
                className="app-control"
                style={{ width: "100%", paddingLeft: 32 }}
              />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 4px" }}>
            {filteredRoster.map((r) => {
              const active = r.id === selectedId;
              const person = byPerson.find((p) => p.name === r.full_name);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: `1px solid ${active ? C.blue : C.lineSoft}`,
                    background: active ? C.blueSoft : C.bg,
                    borderRadius: 12,
                    padding: "14px 14px",
                    marginBottom: 10,
                    cursor: "pointer",
                    minHeight: 78,
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ fontWeight: 800, color: C.ink, fontSize: 14.5 }}>{r.full_name}</div>
                  <div style={{ fontSize: 12.5, color: C.inkSoft, fontWeight: 600, marginTop: 4 }}>
                    {r.title}
                    {r.team ? ` · ${r.team}` : ""}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.inkFaint, fontWeight: 600, marginTop: 6 }}>
                    Day 1 {r.day1}
                    {person
                      ? ` · ${person.leads} leads · ${person.wins} wins · ${fmtDur(Number(person.working_seconds))}`
                      : ""}
                  </div>
                </button>
              );
            })}
            {!filteredRoster.length && !loading ? (
              <div style={{ padding: 16, color: C.inkSoft, fontWeight: 600, fontSize: 13 }}>
                No people match.
              </div>
            ) : null}
          </div>
        </Panel>

        {selected ? (
          <Panel
            title={journey?.full_name || selected.full_name}
            style={{
              display: "flex",
              flexDirection: "column",
              height: SPLIT_PANEL_H,
              maxHeight: SPLIT_PANEL_H,
              boxSizing: "border-box",
            }}
            bodyStyle={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: "12px 16px 18px",
            }}
            right={
              <span style={{ fontSize: 12, fontWeight: 700, color: C.inkSoft }}>
                {journey
                  ? `Day 1 ${journey.day1} · ${journey.tenure_days}d tenure`
                  : journeyLoading
                    ? "Loading…"
                    : selected.day1}
              </span>
            }
          >
            {journeyLoading && !journey ? (
              <div style={{ padding: 12, color: C.inkSoft, fontWeight: 600 }}>Loading journey…</div>
            ) : journey ? (
              <div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <Stat
                    label="Leads"
                    value={journey.totals.leads}
                    sub="Created · click details"
                    tone={C.blue}
                    onClick={() => void openWork("leads")}
                  />
                  <Stat
                    label="QA Q / DQ"
                    value={`${journey.totals.qa_qualified}/${journey.totals.qa_disqualified}`}
                    sub="Decided · click details"
                    tone={TONES.info.fg}
                    onClick={() => void openWork("qa")}
                  />
                  <Stat
                    label="Wins / Lost"
                    value={`${journey.totals.closer_wins}/${journey.totals.closer_lost}`}
                    sub={`${journey.totals.closer_assigned} assigned · click`}
                    tone={TONES.good.fg}
                    onClick={() => void openWork("closer")}
                  />
                  {(Number(journey.totals.docs_reviewed) > 0 ||
                    selected?.role_key === "project_manager") && (
                    <Stat
                      label="Docs"
                      value={journey.totals.docs_reviewed || 0}
                      sub="Reviews · click"
                      onClick={() => void openWork("docs")}
                    />
                  )}
                  {(Number(journey.totals.ops_decided) > 0 ||
                    ["ops_manager", "ops_am", "ops_verifier", "ops_qa_onb", "ops_qa_agent"].includes(
                      selected?.role_key || ""
                    )) && (
                    <Stat
                      label="OPS"
                      value={journey.totals.ops_decided || 0}
                      sub="Decided · click"
                      onClick={() => void openWork("ops")}
                    />
                  )}
                  {(Number(journey.totals.onboard_handled) > 0 ||
                    ["onboarding_lead", "onb_agent", "ops_qa_onb"].includes(
                      selected?.role_key || ""
                    )) && (
                    <Stat
                      label="Onboard"
                      value={journey.totals.onboard_handled || 0}
                      sub="Cases · click"
                      onClick={() => void openWork("onboard")}
                    />
                  )}
                  {(Number(journey.totals.cs_cases) > 0 ||
                    ["cs_head", "cs_lead", "cs_agent"].includes(selected?.role_key || "")) && (
                    <Stat
                      label="CS cases"
                      value={journey.totals.cs_cases || 0}
                      sub="Portfolio · click"
                      onClick={() => void openWork("cs")}
                    />
                  )}
                  <Stat
                    label="Working"
                    value={fmtDur(Number(journey.totals.working_seconds))}
                    sub={`Break ${fmtDur(Number(journey.totals.break_seconds))}`}
                    tone={TONES.good.fg}
                  />
                  <Stat
                    label="Away"
                    value={fmtDur(Number(journey.totals.away_seconds))}
                    sub="Idle + away"
                    tone={TONES.warn.fg}
                  />
                </div>

                {workKind ? (
                  <div
                    style={{
                      marginBottom: 16,
                      border: `1px solid ${C.line}`,
                      borderRadius: 12,
                      background: C.bg,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        borderBottom: `1px solid ${C.lineSoft}`,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>
                        {WORK_META[workKind].title} · {journey.full_name}
                        <span style={{ fontWeight: 600, color: C.inkSoft, marginLeft: 8 }}>
                          {workLoading
                            ? "Loading…"
                            : `${visibleWorkItems.length}${
                                workKind === "qa" && workFilter !== "all"
                                  ? ` ${workFilter}`
                                  : ""
                              } / ${workItems.length}`}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {workKind === "qa"
                          ? (["Qualified", "Disqualified", "all"] as const).map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setWorkFilter(f)}
                                style={{
                                  border: "none",
                                  borderRadius: 8,
                                  padding: "4px 8px",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  background: workFilter === f ? C.blueSoft : "transparent",
                                  color: workFilter === f ? C.blueDeep : C.inkSoft,
                                }}
                              >
                                {f === "all" ? "All" : f}
                              </button>
                            ))
                          : null}
                        <button
                          type="button"
                          onClick={() => setWorkKind(null)}
                          aria-label="Close work list"
                          style={{
                            border: "none",
                            background: C.lineSoft,
                            borderRadius: 8,
                            padding: 6,
                            cursor: "pointer",
                            color: C.inkSoft,
                            display: "inline-flex",
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <div style={{ maxHeight: 420, overflow: "auto", padding: 10 }}>
                      {workLoading ? (
                        <div style={{ padding: 12, color: C.inkSoft, fontWeight: 600, fontSize: 13 }}>
                          Loading…
                        </div>
                      ) : visibleWorkItems.length ? (
                        visibleWorkItems.map((item) => {
                          const lid = String(item.lead_id || "");
                          const open = expandedLead === lid;
                          return (
                            <div
                              key={lid + String(item.qa_decision || item.stage || item.status || "")}
                              style={{
                                border: `1px solid ${C.lineSoft}`,
                                borderRadius: 10,
                                padding: "10px 12px",
                                marginBottom: 8,
                                background: C.surface,
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => setExpandedLead(open ? null : lid)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                <div style={{ fontWeight: 800, color: C.ink, fontSize: 13 }}>
                                  {String(item.business_name || lid)}
                                  <span
                                    className="mono"
                                    style={{
                                      fontWeight: 600,
                                      color: C.inkSoft,
                                      marginLeft: 8,
                                      fontSize: 12,
                                    }}
                                  >
                                    {lid}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: C.inkSoft,
                                    marginTop: 2,
                                  }}
                                >
                                  {workSummaryLine(workKind, item)}
                                </div>
                              </button>
                              {open ? (
                                <>
                                  <WorkDetailRows kind={workKind} item={item} />
                                  <button
                                    type="button"
                                    className="app-cta"
                                    style={{ marginTop: 10, fontSize: 12, padding: "7px 12px" }}
                                    onClick={() => {
                                      const tab = WORK_META[workKind].openTab;
                                      app.jumpTo(tab, lid);
                                      router.push(`/${tab}`);
                                    }}
                                  >
                                    Open in {WORK_META[workKind].openTab}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ padding: 12, color: C.inkSoft, fontWeight: 600, fontSize: 13 }}>
                          {WORK_META[workKind].empty}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8 }}>
                  Sales output by week (Day 1 → today)
                </div>
                {(journey.output_weeks || []).length ? (
                  journey.output_weeks.map((w) => {
                    const output =
                      (bucket === "lg" || bucket === "other" ? w.leads : 0) +
                      (bucket === "qa" || bucket === "other" ? w.qa_q : 0) +
                      (bucket === "closer" || bucket === "other" ? w.wins : 0);
                    const labelBits = [
                      bucket === "lg" || bucket === "other" ? `${w.leads}L` : null,
                      bucket === "qa" || bucket === "other" ? `${w.qa_q}Q/${w.qa_rej}DQ` : null,
                      bucket === "closer" || bucket === "other" ? `${w.wins}W/${w.lost}L` : null,
                    ].filter(Boolean);
                    return (
                      <Bar
                        key={w.week_start}
                        label={`W ${weekLabel(w.week_start)} · ${labelBits.join(" · ")}`}
                        value={output}
                        max={weekMax}
                        color={
                          bucket === "closer"
                            ? TONES.good.fg
                            : bucket === "qa"
                              ? TONES.info.fg
                              : C.blue
                        }
                      />
                    );
                  })
                ) : (
                  <div style={{ color: C.inkSoft, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                    No sales activity recorded since Day 1.
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, margin: "18px 0 8px" }}>
                  Attendance — last 30 days
                  <span style={{ fontWeight: 600, color: C.inkSoft, marginLeft: 8 }}>
                    <span style={{ color: TONES.good.fg }}>■</span> Working{" "}
                    <span style={{ color: TONES.info.fg }}>■</span> Break{" "}
                    <span style={{ color: TONES.warn.fg }}>■</span> Away
                  </span>
                </div>
                {(journey.attendance_days || []).length ? (
                  journey.attendance_days.map((d) => (
                    <StackedBar
                      key={d.day}
                      label={weekLabel(d.day)}
                      max={dayAttendMax}
                      right={fmtDur(d.working_seconds)}
                      segments={[
                        {
                          value: d.working_seconds,
                          color: TONES.good.fg,
                          title: `Working ${fmtDur(d.working_seconds)}`,
                        },
                        {
                          value: d.break_seconds,
                          color: TONES.info.fg,
                          title: `Break ${fmtDur(d.break_seconds)}`,
                        },
                        {
                          value: d.away_seconds,
                          color: TONES.warn.fg,
                          title: `Away ${fmtDur(d.away_seconds)}`,
                        },
                      ]}
                    />
                  ))
                ) : (
                  <div style={{ color: C.inkSoft, fontSize: 13, fontWeight: 600 }}>
                    No presence days in the last 30 days.
                  </div>
                )}

                {(journey.attendance_months || []).length > 1 ? (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, margin: "18px 0 8px" }}>
                      Attendance by month (full tenure)
                    </div>
                    {journey.attendance_months.map((m) => (
                      <StackedBar
                        key={m.month_start}
                        label={monthLabel(m.month_start)}
                        max={monthAttendMax}
                        right={fmtDur(Number(m.working_seconds))}
                        segments={[
                          {
                            value: Number(m.working_seconds),
                            color: TONES.good.fg,
                          },
                          {
                            value: Number(m.break_seconds),
                            color: TONES.info.fg,
                          },
                          {
                            value: Number(m.away_seconds),
                            color: TONES.warn.fg,
                          },
                        ]}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            ) : (
              <div style={{ padding: 24, color: C.inkSoft, fontWeight: 600 }}>
                Select a person to load their journey.
              </div>
            )}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
