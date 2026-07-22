"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Download, RefreshCw, UserRoundSearch } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { useApp } from "@/components/app-context";
import { Stat, Panel, Bar } from "@/components/dash";
import {
  fetchPresenceBoard,
  fetchPresenceEvents,
  fetchPresenceWeek,
  type PresenceDayRow,
  type PresenceEvent,
  type PresenceRow,
  type PresenceStatus,
} from "@/actions/presence";
import { deviceOf, ago } from "@/components/ActiveLogins";
import { createClient } from "@/lib/supabase/client";

const DAY_TARGET_SEC = 8 * 3600;
const WEEK_TARGET_SEC = 40 * 3600;

type SortKey = "status" | "day" | "week" | "name";
type FilterKey = "all" | "online" | "break" | "away" | "offline" | "below";

function breakLabel(type?: string | null): string {
  if (type === "meal" || type === "lunch") return "Meal break";
  if (type === "general" || type === "tea" || type === "smoke") return "General break";
  return "On break";
}

function fmtDur(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}h ${m}m ${r}s`;
}

function weekdayLabel(day: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(day + "T00:00:00Z"));
  } catch {
    return day;
  }
}

function todayKarachi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** CRM still open (heartbeat fresh) — includes Away / Break. */
function isOnline(status: PresenceStatus): boolean {
  return status !== "offline";
}

function isAway(status: PresenceStatus): boolean {
  return status === "away" || status === "idle";
}

function statusTone(status: PresenceStatus) {
  if (status === "working") return TONES.good;
  if (status === "break") return TONES.info;
  if (isAway(status)) return TONES.warn;
  return TONES.neutral;
}

function statusLabel(status: PresenceStatus, breakType?: string | null): string {
  if (status === "working") return "Logged in";
  if (status === "break") return breakLabel(breakType);
  if (isAway(status)) return "Away";
  return "Logged out";
}

function statusRank(s: PresenceStatus): number {
  if (s === "working") return 0;
  if (s === "break") return 1;
  if (isAway(s)) return 2;
  return 3;
}

/** Seconds since last heartbeat (unflushed slice — matches presence_heartbeat delta). */
function heartbeatDelta(r: PresenceRow, nowMs: number): number {
  if (!r.last_heartbeat_at) return 0;
  const t = new Date(r.last_heartbeat_at).getTime();
  if (Number.isNaN(t)) return 0;
  // Board marks offline after 90s; don't invent time beyond that.
  return Math.min(90, Math.max(0, Math.floor((nowMs - t) / 1000)));
}

type LiveOpts = { nowMs: number; live: boolean };

/** Logged-in (active) time today only — excludes Away and all breaks. */
function onlineSample(r: PresenceRow, opts?: LiveOpts): number {
  let s = r.working_seconds || 0;
  if (opts?.live && (r.status === "working" || r.status === "idle")) {
    s += heartbeatDelta(r, opts.nowMs);
  }
  return s;
}

function generalBreakSample(r: PresenceRow, opts?: LiveOpts): number {
  let s = r.general_break_seconds || 0;
  if (opts?.live && r.status === "break") {
    const bt = String(r.break_type || "").toLowerCase();
    if (bt !== "meal" && bt !== "lunch") s += heartbeatDelta(r, opts.nowMs);
  }
  return s;
}

/** Meal break seconds (DB column still lunch_break_seconds). */
function mealBreakSample(r: PresenceRow, opts?: LiveOpts): number {
  let s = r.lunch_break_seconds || 0;
  if (opts?.live && r.status === "break") {
    const bt = String(r.break_type || "").toLowerCase();
    if (bt === "meal" || bt === "lunch") s += heartbeatDelta(r, opts.nowMs);
  }
  return s;
}

function weekOnlineSample(r: PresenceRow, opts?: LiveOpts): number {
  let s = r.week_working_seconds || 0;
  if (opts?.live && (r.status === "working" || r.status === "idle")) {
    s += heartbeatDelta(r, opts.nowMs);
  }
  return s;
}

function weekGeneralBreakSample(r: PresenceRow, opts?: LiveOpts): number {
  let s = r.week_general_break_seconds || 0;
  if (opts?.live && r.status === "break") {
    const bt = String(r.break_type || "").toLowerCase();
    if (bt !== "meal" && bt !== "lunch") s += heartbeatDelta(r, opts.nowMs);
  }
  return s;
}

function weekMealBreakSample(r: PresenceRow, opts?: LiveOpts): number {
  let s = r.week_lunch_break_seconds || 0;
  if (opts?.live && r.status === "break") {
    const bt = String(r.break_type || "").toLowerCase();
    if (bt === "meal" || bt === "lunch") s += heartbeatDelta(r, opts.nowMs);
  }
  return s;
}

function dayProgress(r: PresenceRow, opts?: LiveOpts): number {
  return Math.min(100, Math.round((onlineSample(r, opts) / DAY_TARGET_SEC) * 100));
}

function weekProgress(r: PresenceRow, opts?: LiveOpts): number {
  return Math.min(100, Math.round((weekOnlineSample(r, opts) / WEEK_TARGET_SEC) * 100));
}

/** Below target: day online < 50% of 8h with ≥2h online sample */
function isBelowTarget(r: PresenceRow, opts?: LiveOpts): boolean {
  const sample = onlineSample(r, opts);
  if (sample < 2 * 3600) return false;
  return sample < DAY_TARGET_SEC * 0.5;
}

function progressTone(pct: number, sampleOk: boolean): string {
  if (!sampleOk) return C.inkFaint;
  if (pct >= 90) return TONES.good.fg;
  if (pct >= 50) return TONES.warn.fg;
  return TONES.bad.fg;
}

function flagOf(r: PresenceRow, opts?: LiveOpts): { label: string; tone: keyof typeof TONES } | null {
  if (isBelowTarget(r, opts)) return { label: "Below target", tone: "bad" };
  return null;
}

function liveIdleSeconds(r: PresenceRow, nowMs: number): number {
  if (r.last_input_at) {
    const t = new Date(r.last_input_at).getTime();
    if (!Number.isNaN(t)) return Math.max(r.idle_seconds || 0, Math.floor((nowMs - t) / 1000));
  }
  return r.idle_seconds || 0;
}

function verdict(
  r: PresenceRow,
  opts?: LiveOpts
): { label: string; tone: keyof typeof TONES; detail: string } {
  const total = onlineSample(r, opts);
  const nowMs = opts?.nowMs ?? Date.now();
  if (r.status === "break") {
    const started = r.break_started_at
      ? fmtDur(Math.max(0, Math.floor((nowMs - new Date(r.break_started_at).getTime()) / 1000)))
      : "";
    const todayOfType =
      r.break_type === "meal" || r.break_type === "lunch"
        ? mealBreakSample(r, opts)
        : generalBreakSample(r, opts);
    return {
      label: breakLabel(r.break_type),
      tone: "info",
      detail: started
        ? `On break for ${started} · ${fmtDur(todayOfType)} today`
        : `${fmtDur(todayOfType)} today`,
    };
  }
  if (isAway(r.status)) {
    return {
      label: "Away",
      tone: "warn",
      detail: `No mouse/keyboard for ${fmtDur(liveIdleSeconds(r, nowMs))} (2+ min) · CRM still open`,
    };
  }
  if (r.status === "working") {
    return {
      label: "Logged in",
      tone: "good",
      detail: r.current_tab
        ? `Active on /${r.current_tab} · ${fmtDur(total)} online today`
        : `Active · ${fmtDur(total)} online today`,
    };
  }
  if (total === 0) {
    return { label: "Logged out", tone: "neutral", detail: "Has not opened CRM today" };
  }
  return {
    label: "Logged out",
    tone: "neutral",
    detail: `CRM closed · ${fmtDur(total)} online earlier today`,
  };
}

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadPresenceCsv(rows: PresenceRow[], day: string) {
  const headers = [
    "Name", "Title", "Team", "Status", "Logged in today",
    "General break today", "Meal break today", "Logged in this week",
    "General break week", "Meal break week",
    "Day % of 8h", "Week % of 40h", "Interactions", "Current tab", "Flag",
  ];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) => {
      const flag = flagOf(r);
      return [
        r.name,
        r.title,
        r.team,
        statusLabel(r.status, r.break_type),
        fmtDur(onlineSample(r)),
        fmtDur(generalBreakSample(r)),
        fmtDur(mealBreakSample(r)),
        fmtDur(weekOnlineSample(r)),
        fmtDur(r.week_general_break_seconds || 0),
        fmtDur(r.week_lunch_break_seconds || 0),
        String(dayProgress(r)),
        String(weekProgress(r)),
        String(r.interactions),
        r.current_tab || "",
        flag?.label || "",
      ].map(csvEscape).join(",");
    }),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employee-monitor-${day}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function StatusChip({
  status,
  breakType,
}: {
  status: PresenceStatus;
  breakType?: string | null;
}) {
  const t = statusTone(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: "0.02em",
      }}
    >
      {status === "working" ? <span className="pulse-dot" /> : (
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.fg }} />
      )}
      {statusLabel(status, breakType)}
    </span>
  );
}

export default function MonitorPage() {
  const app = useApp();
  const [day, setDay] = useState(todayKarachi);
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("status");
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<PresenceEvent[]>([]);
  const [weekDays, setWeekDays] = useState<PresenceDayRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const liveDay = day === todayKarachi();
  const live: LiveOpts = { nowMs, live: liveDay };

  const load = useCallback(() => {
    setLoading(true);
    fetchPresenceBoard({ day }).then((res) => {
      setRows(res.rows || []);
      setErr(res.error || "");
      setLoading(false);
    });
  }, [day]);

  // Live clock — tick durations every second while viewing today.
  useEffect(() => {
    if (!liveDay) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [liveDay]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => load(), 400);
    };
    const channel = supabase
      .channel("monitor-presence-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_presence" },
        schedule
      )
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setWeekDays([]);
      return;
    }
    setEventsLoading(true);
    Promise.all([
      fetchPresenceEvents({ userId: selected, day }),
      fetchPresenceWeek({ userId: selected, day }),
    ]).then(([ev, wk]) => {
      setEvents(ev.events || []);
      setWeekDays(wk.days || []);
      setEventsLoading(false);
    });
  }, [selected, day]);

  const counts = useMemo(() => {
    const c = { online: 0, onBreak: 0, away: 0, offline: 0, below: 0 };
    for (const r of rows) {
      if (r.status === "working") c.online += 1;
      else if (r.status === "break") c.onBreak += 1;
      else if (isAway(r.status)) c.away += 1;
      else c.offline += 1;
      if (isBelowTarget(r, live)) c.below += 1;
    }
    return c;
  }, [rows, nowMs, liveDay]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (filter === "below") {
        if (!isBelowTarget(r, live)) return false;
      } else if (filter === "online") {
        if (r.status !== "working") return false;
      } else if (filter === "break") {
        if (r.status !== "break") return false;
      } else if (filter === "away") {
        if (!isAway(r.status)) return false;
      } else if (filter === "offline") {
        if (isOnline(r.status)) return false;
      }
      if (!qq) return true;
      return (
        r.name.toLowerCase().includes(qq) ||
        r.title.toLowerCase().includes(qq) ||
        r.team.toLowerCase().includes(qq) ||
        r.current_tab.toLowerCase().includes(qq)
      );
    });

    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "day") return onlineSample(b, live) - onlineSample(a, live);
      if (sort === "week") return weekOnlineSample(b, live) - weekOnlineSample(a, live);
      const sr = statusRank(a.status) - statusRank(b.status);
      if (sr !== 0) return sr;
      return onlineSample(b, live) - onlineSample(a, live);
    });
    return list;
  }, [rows, q, filter, sort, nowMs, liveDay]);

  const selectedRow = rows.find((r) => r.user_id === selected) || null;

  if (!app.canSeeMonitor) {
    return <div className="app-gate">Employee Monitor is restricted.</div>;
  }

  return (
    <div className="app-page">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="app-page-head" style={{ marginBottom: 0 }}>
          <div className="app-page-title">
            <Activity size={22} style={{ color: C.blue }} />
            Employee Monitor
          </div>
          <div className="app-page-lede">
            Logged in · Breaks (general / meal) · Away after 2 min idle · Logged out · Asia/Karachi
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="app-control"
          />
          <button type="button" onClick={load} className="app-control" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => downloadPresenceCsv(filtered, day)}
            disabled={!filtered.length}
            className="app-cta"
            style={{ opacity: filtered.length ? 1 : 0.5, cursor: filtered.length ? "pointer" : "default" }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
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
          {err.includes("dash_presence") || err.includes("function") || err.includes("does not exist")
            ? "Presence SQL not applied yet. Run sql/30_presence_breaks.sql in Supabase SQL Editor, then refresh."
            : err}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <Stat label="Logged in" value={counts.online} sub="Active — counts in Logged in today" tone={TONES.good.fg} onClick={() => setFilter("online")} />
        <Stat label="On break" value={counts.onBreak} sub="General / meal" tone={TONES.info.fg} onClick={() => setFilter("break")} />
        <Stat label="Away" value={counts.away} sub="Idle 2+ min — not in total" tone={TONES.warn.fg} onClick={() => setFilter("away")} />
        <Stat label="Logged out" value={counts.offline} sub="CRM closed / no signal" tone={C.inkSoft} onClick={() => setFilter("offline")} />
        <Stat label="Below target" value={counts.below} sub="< 50% of 8h (2h+ online)" tone={TONES.bad.fg} onClick={() => setFilter("below")} />
      </div>

      <div
        className="monitor-split"
        style={{ display: "grid", gridTemplateColumns: selectedRow ? "1.45fr 1fr" : "1fr", gap: 14 }}
      >
        <Panel
          title="Live roster"
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setFilter("all")}
                style={{
                  border: "none",
                  background: filter === "all" ? C.blueSoft : "transparent",
                  color: filter === "all" ? C.blueDeep : C.inkSoft,
                  fontWeight: 700,
                  fontSize: 12,
                  borderRadius: 8,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                All ({rows.length})
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="app-control"
                style={{ padding: "5px 8px", fontSize: 12 }}
              >
                <option value="status">Sort: Login status</option>
                <option value="day">Sort: Logged in today</option>
                <option value="week">Sort: Online this week</option>
                <option value="name">Sort: Name</option>
              </select>
              <div style={{ position: "relative" }}>
                <UserRoundSearch size={14} style={{ position: "absolute", left: 8, top: 8, color: C.inkFaint }} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name / team / tab"
                  className="app-control"
                  style={{ paddingLeft: 28, width: 180, fontSize: 12 }}
                />
              </div>
            </div>
          }
        >
          {loading && !rows.length ? (
            <div style={{ padding: 20, color: C.inkSoft, fontWeight: 600 }}>Loading live presence…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, color: C.inkSoft, fontWeight: 600 }}>No employees match this filter.</div>
          ) : (
            <div className="data-table-scroll">
              <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: C.inkSoft, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    <th style={{ padding: "8px 10px" }}>Employee</th>
                    <th style={{ padding: "8px 10px" }}>Status</th>
                    <th style={{ padding: "8px 10px" }}>Logged in today</th>
                    <th style={{ padding: "8px 10px" }}>General break</th>
                    <th style={{ padding: "8px 10px" }}>Meal break</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const active = selected === r.user_id;
                    return (
                      <tr
                        key={r.user_id}
                        onClick={() => setSelected(r.user_id === selected ? null : r.user_id)}
                        style={{
                          borderTop: `1px solid ${C.lineSoft}`,
                          cursor: "pointer",
                          background: active ? C.blueSoft : "transparent",
                        }}
                      >
                        <td style={{ padding: "10px" }}>
                          <div style={{ fontWeight: 800, color: C.ink, display: "flex", alignItems: "center", gap: 7 }}>
                            {r.status === "working" ? <span className="pulse-dot" /> : null}
                            {r.name}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkSoft }}>
                            {r.title}
                            {r.team ? ` · ${r.team}` : ""}
                          </div>
                        </td>
                        <td style={{ padding: "10px" }}>
                          <StatusChip status={r.status} breakType={r.break_type} />
                          <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 4, fontWeight: 600 }}>
                            {isAway(r.status)
                              ? `Idle ${fmtDur(liveIdleSeconds(r, nowMs))}`
                              : r.last_heartbeat_at
                                ? ago(r.last_heartbeat_at)
                                : "never"}
                          </div>
                        </td>
                        <td className="mono" style={{ padding: "10px", fontWeight: 700, color: TONES.good.fg, whiteSpace: "nowrap" }}>
                          {fmtDur(onlineSample(r, live))}
                        </td>
                        <td className="mono" style={{ padding: "10px", fontWeight: 700, color: TONES.info.fg, whiteSpace: "nowrap" }}>
                          {fmtDur(generalBreakSample(r, live))}
                        </td>
                        <td className="mono" style={{ padding: "10px", fontWeight: 700, color: TONES.info.fg, whiteSpace: "nowrap" }}>
                          {fmtDur(mealBreakSample(r, live))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {selectedRow ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Panel
              title={selectedRow.name}
              right={<StatusChip status={selectedRow.status} breakType={selectedRow.break_type} />}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginBottom: 10 }}>
                {selectedRow.title}
                {selectedRow.team ? ` · ${selectedRow.team}` : ""} · {deviceOf(selectedRow.user_agent)}
              </div>
              {(() => {
                const v = verdict(selectedRow, live);
                const flag = flagOf(selectedRow, live);
                return (
                  <>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: TONES[v.tone].bg,
                        color: TONES[v.tone].fg,
                        fontWeight: 700,
                        fontSize: 13,
                        marginBottom: 10,
                      }}
                    >
                      {v.label} — {v.detail}
                    </div>
                    {flag ? (
                      <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, color: TONES[flag.tone].fg }}>
                        Flag: {flag.label}
                      </div>
                    ) : null}
                  </>
                );
              })()}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                <Mini label="Logged in today" value={fmtDur(onlineSample(selectedRow, live))} />
                <Mini label="General break today" value={fmtDur(generalBreakSample(selectedRow, live))} />
                <Mini label="Meal break today" value={fmtDur(mealBreakSample(selectedRow, live))} />
                <Mini label="Day vs 8h" value={`${dayProgress(selectedRow, live)}%`} />
                <Mini label="Logged in this week" value={fmtDur(weekOnlineSample(selectedRow, live))} />
                <Mini label="General break week" value={fmtDur(weekGeneralBreakSample(selectedRow, live))} />
                <Mini label="Meal break week" value={fmtDur(weekMealBreakSample(selectedRow, live))} />
                <Mini label="Week vs 40h" value={`${weekProgress(selectedRow, live)}%`} />
              </div>
              {selectedRow.week_start && selectedRow.week_end ? (
                <div style={{ fontSize: 11, fontWeight: 700, color: C.inkSoft, marginBottom: 10 }}>
                  Week: {String(selectedRow.week_start).slice(0, 10)} → {String(selectedRow.week_end).slice(0, 10)} (Mon–Sun)
                </div>
              ) : null}

              <div style={{ fontSize: 12, fontWeight: 800, color: C.inkSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                This week — day by day
              </div>
              {eventsLoading && !weekDays.length ? (
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600, marginBottom: 10 }}>Loading week…</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {weekDays.map((d) => {
                    const isSel = String(d.day).slice(0, 10) === day;
                    const pct = Math.min(100, Math.round((d.working_seconds / DAY_TARGET_SEC) * 100));
                    return (
                      <div
                        key={String(d.day)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "88px 1fr",
                          gap: 8,
                          alignItems: "center",
                          padding: "7px 9px",
                          borderRadius: 10,
                          background: isSel ? C.blueSoft : C.bg,
                          border: `1px solid ${isSel ? C.blue : C.lineSoft}`,
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.ink }}>
                          {weekdayLabel(String(d.day).slice(0, 10))}
                        </div>
                        <div>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 800, color: TONES.good.fg }}>
                            Logged in {fmtDur(d.working_seconds)} · {pct}% of 8h
                            {(d.general_break_seconds || 0) > 0 ? (
                              <span style={{ color: TONES.info.fg, fontWeight: 700 }}>
                                {" "}
                                · Gen {fmtDur(d.general_break_seconds || 0)}
                              </span>
                            ) : null}
                            {(d.lunch_break_seconds || 0) > 0 ? (
                              <span style={{ color: TONES.info.fg, fontWeight: 700 }}>
                                {" "}
                                · Meal {fmtDur(d.lunch_break_seconds || 0)}
                              </span>
                            ) : null}
                          </div>
                          <div className="shift-bar">
                            <i style={{ width: `${pct}%`, background: progressTone(pct, d.working_seconds > 0) }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 800, color: C.inkSoft, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Time on CRM tabs (selected day)
              </div>
              {Object.keys(selectedRow.tabs || {}).length === 0 ? (
                <div style={{ fontSize: 12, color: C.inkFaint, fontWeight: 600 }}>No tab time logged yet.</div>
              ) : (
                Object.entries(selectedRow.tabs)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([tab, sec]) => {
                    const max = Math.max(...Object.values(selectedRow.tabs));
                    return <Bar key={tab} label={`/${tab}`} value={Math.round(sec / 60)} max={Math.max(1, Math.round(max / 60))} suffix="" color={C.blue} />;
                  })
              )}
            </Panel>

            <Panel title="Status timeline">
              {eventsLoading ? (
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>Loading…</div>
              ) : events.length === 0 ? (
                <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>No status changes logged for this day yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
                  {events.map((e) => {
                    const t = statusTone(e.status);
                    return (
                      <div
                        key={e.id}
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          padding: "8px 10px",
                          borderRadius: 10,
                          background: C.bg,
                          border: `1px solid ${C.lineSoft}`,
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: t.fg,
                            marginTop: 5,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, fontSize: 12, color: C.ink }}>
                            {e.prev_status
                              ? `${statusLabel(e.prev_status as PresenceStatus)} → `
                              : ""}
                            {statusLabel(e.status)}
                            {e.status === "break" ? " (declared)" : ""}
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkSoft }}>
                            {String(e.created_at).slice(0, 19).replace("T", " ")}
                            {e.current_tab ? ` · /${e.current_tab}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: C.inkSoft, lineHeight: 1.45 }}>
        <b style={{ color: C.ink }}>Logged in today</b> = active desk time only (login → logout; Away + breaks excluded).{" "}
        <b style={{ color: C.ink }}>On break</b> = general / meal (own columns).{" "}
        <b style={{ color: C.ink }}>Away</b> = no input 2+ min (status only, not in Logged in total).{" "}
        <b style={{ color: C.ink }}>Logged out</b> = CRM closed.
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: C.bg,
        border: `1px solid ${C.lineSoft}`,
        borderRadius: 10,
        padding: "8px 10px",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, color: C.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 800, color: C.ink, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
