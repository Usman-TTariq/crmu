"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Download, KeyRound, Loader2, Plus, ShieldOff } from "lucide-react";
import { C, TONES, NEUTRAL_CHIP } from "@/lib/theme";
import { isBlank, num, numfmt } from "@/lib/format";
import { SCHEMAS, type FieldDef } from "@/lib/schemas";
import { TABS, USER_ADMIN_ROLES, TITLE_ROLE_MAP } from "@/lib/constants";
import type { Rec } from "@/lib/types";
import { useApp } from "@/components/app-context";
import DataTable from "@/components/DataTable";
import Drawer from "@/components/Drawer";
import { Panel, LBRow, type Badge } from "@/components/dash";
import { fetchRows, saveRecord, deleteRecord } from "@/actions/data";
import { fetchBoards, type BoardCloserRow, type BoardLeadRow, type BoardTeamRow } from "@/actions/dashboard";
import { createUserForProfile, setProfileActive, revokeLogin, setUserPassword } from "@/actions/admin";
import { startViewAs } from "@/actions/impersonate";

function closerBadges(rows: BoardCloserRow[]): (r: BoardCloserRow) => Badge | null {
  const maxW = Math.max(0, ...rows.map((r) => r.w));
  const bestRate = Math.max(0, ...rows.filter((r) => r.w + r.l > 0).map((r) => r.rate));
  const fastVals = rows.filter((r) => r.avgd !== null && r.w > 0).map((r) => r.avgd as number);
  const fast = fastVals.length ? Math.min(...fastVals) : null;
  const maxVol = Math.max(0, ...rows.map((r) => num(r.vol)));
  return (r) => {
    if (maxW > 0 && r.w === maxW) return { e: "\u{1F3C6}", t: "Top Closer" };
    if (bestRate > 0 && r.w + r.l > 0 && r.rate === bestRate) return { e: "\u{1F3AF}", t: "Sharpshooter" };
    if (fast !== null && r.avgd === fast && r.w > 0) return { e: "\u26A1", t: "Fastest Close" };
    if (maxVol > 0 && num(r.vol) === maxVol) return { e: "\u{1F4B0}", t: "Volume Leader" };
    return null;
  };
}

// ---------------------------------------------------------------------------
// Roster grouping: Leadership → Sales pods → Sales QA → Operations,
// each section ordered by rank (supervisor → agents → closers), then name.
// ---------------------------------------------------------------------------
const TEAM_ORDER = ["Olympus", "Phoenix", "Spartan", "Titans"];
const TITLE_ORDER = [
  "CEO", "Super Admin",   "Sales Head & QA", "Head of Workforce Performance and Quality", "AVP Sales", "Floor Manager",
  "Lead Gen Supervisor", "Lead Gen Agent", "Closer", "Tier 3", "QA Agent",
  "Project Manager",
  "Manager", "Assistant Manager", "QA & Funding Lead", "OPS QA & Onboarding", "Quality Assurance",
  "Onboarding Lead", "Onboarding Agent",
  "Customer Success Head", "Customer Success Lead", "Customer Success Agent",
];

const LEADERSHIP_ROLES = new Set(["ceo", "super_admin", "sales_head", "avp_sales", "floor_manager"]);

function rosterGroup(r: Rec): string {
  if (r.dept === "ALL" || LEADERSHIP_ROLES.has(String(r.role_key))) return "Leadership";
  if (r.dept === "SALES") return r.team ? `Sales · Team ${r.team}` : "Sales · QA";
  if (r.dept === "DOCUMENTATION" || r.role_key === "project_manager") return "Documentation";
  return "Operations";
}

function rosterGroupRank(r: Rec): number {
  if (r.dept === "ALL" || LEADERSHIP_ROLES.has(String(r.role_key))) return 0;
  if (r.dept === "SALES") {
    if (r.team) {
      const t = TEAM_ORDER.indexOf(String(r.team));
      return 1 + (t === -1 ? TEAM_ORDER.length : t);
    }
    return 1 + TEAM_ORDER.length + 1; // Sales · QA
  }
  if (r.dept === "DOCUMENTATION" || r.role_key === "project_manager") {
    return 1 + TEAM_ORDER.length + 2;
  }
  return 1 + TEAM_ORDER.length + 3; // Operations
}

function titleRank(r: Rec): number {
  const t = TITLE_ORDER.indexOf(String(r.title));
  return t === -1 ? TITLE_ORDER.length : t;
}

function sortRoster(rows: Rec[]): Rec[] {
  return [...rows].sort(
    (a, b) =>
      rosterGroupRank(a) - rosterGroupRank(b) ||
      titleRank(a) - titleRank(b) ||
      String(a.full_name).localeCompare(String(b.full_name))
  );
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function rosterCellText(f: FieldDef, r: Rec): string {
  if (f.type === "computed") {
    const v = f.compute ? f.compute(r) : r[f.k];
    if (f.fmt === "num") return numfmt(v);
    return v == null ? "" : String(v);
  }
  const v = r[f.k];
  if (isBlank(v)) return "";
  if (f.fmt === "num") return numfmt(v);
  return String(v);
}

function downloadRosterCsv(rows: Rec[], fields: FieldDef[]) {
  const cols = fields.filter((f) => !f.hideTable);
  const headers = ["Category", ...cols.map((f) => f.label)];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) =>
      [rosterGroup(r), ...cols.map((f) => rosterCellText(f, r))].map(csvEscape).join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `team-roster-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function leadBadges(rows: BoardLeadRow[]): (r: BoardLeadRow) => Badge | null {
  const maxL = Math.max(0, ...rows.map((r) => r.leads));
  const bestRate = Math.max(0, ...rows.filter((r) => r.q + r.rej > 0).map((r) => r.rate));
  return (r) => {
    if (maxL > 0 && r.leads === maxL) return { e: "\u{1F3C6}", t: "Top Generator" };
    if (bestRate > 0 && r.q + r.rej > 0 && r.rate === bestRate) return { e: "\u{1F3AF}", t: "Quality Leader" };
    return null;
  };
}

export default function TeamSetupPage() {
  const app = useApp();
  const tabDef = TABS.find((t) => t.k === "teamsetup")!;
  const fields = SCHEMAS.teamsetup;
  const isAdmin = USER_ADMIN_ROLES.includes(app.role.key);
  const canEdit = app.editTabs.includes("teamsetup") && isAdmin;
  const canViewAs = isAdmin && !app.viewAsName;
  const [viewAsBusy, setViewAsBusy] = useState<string | null>(null);

  const [rows, setRows] = useState<Rec[] | null>(null);
  const [boards, setBoards] = useState<{ closers: BoardCloserRow[]; leadgen: BoardLeadRow[]; teams: BoardTeamRow[] } | null>(null);
  const [drawer, setDrawer] = useState<{ record: Rec; isNew: boolean } | null>(null);
  const rosterLoading = rows === null;

  // user creation form
  const [selProfile, setSelProfile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // access management form
  const [accProfile, setAccProfile] = useState("");
  const [accBusy, setAccBusy] = useState(false);
  const [accPassword, setAccPassword] = useState("");

  const pushToasts = app.pushToasts;

  const load = useCallback(() => {
    // Roster first — boards (leaderboards) load separately so the table isn't blocked.
    return fetchRows({ tab: "teamsetup", tf: app.tf }).then((r) => {
      if (r.error) pushToasts([r.error]);
      setRows(r.rows);
      fetchBoards({ tf: app.tf }).then(setBoards);
    });
  }, [app.tf, pushToasts]);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchRows({ tab: "teamsetup", tf: app.tf }).then((r) => {
      if (!alive) return;
      if (r.error) pushToasts([r.error]);
      setRows(r.rows);
    });
    fetchBoards({ tf: app.tf }).then((b) => {
      if (alive) setBoards(b);
    });
    return () => {
      alive = false;
    };
  }, [app.tf, pushToasts]);

  const openAdd = useCallback(() => {
    setDrawer({
      record: { id: "", full_name: "", title: "", dept: "SALES", team: "", role_key: "lg_agent", target: "", notes: "" },
      isNew: true,
    });
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    return app.onAdd(openAdd);
  }, [app, canEdit, openAdd]);

  if (!app.viewTabs.includes("teamsetup")) {
    return <div className="app-gate">This tab is not visible to your role.</div>;
  }

  const onSave = async (draft: Rec, isNew: boolean) => {
    // Access role is derived from the title, never picked by hand.
    const derivedRole = TITLE_ROLE_MAP[String(draft.title || "")];
    if (!derivedRole && isNew) {
      app.pushToasts(["Pick a title so the access role can be assigned."]);
      return;
    }
    const values = derivedRole ? { ...draft, role_key: derivedRole } : draft;
    const res = await saveRecord({ tab: "teamsetup", id: isNew ? null : String(draft.id), values });
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    app.pushToasts([isNew ? "Team member added." : "Team member updated."]);
    setDrawer(null);
    load();
  };

  const onDelete = async (rec: Rec) => {
    const res = await deleteRecord({ tab: "teamsetup", id: String(rec.id) });
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    setDrawer(null);
    load();
  };

  const createLogin = async () => {
    if (!selProfile || !email || !password) {
      app.pushToasts(["Pick a person and fill email + password."]);
      return;
    }
    setCreating(true);
    const res = await createUserForProfile({ profileId: selProfile, email, password });
    setCreating(false);
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    app.pushToasts(["Login created."]);
    setSelProfile("");
    setEmail("");
    setPassword("");
    load();
  };

  const roster = rows || [];
  const accSelected = roster.find((r) => String(r.id) === accProfile) || null;

  const toggleActive = async () => {
    if (!accSelected) return;
    setAccBusy(true);
    const active = accSelected.is_active === false;
    const res = await setProfileActive({ profileId: String(accSelected.id), active });
    setAccBusy(false);
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    app.pushToasts([
      `${accSelected.full_name} ${active ? "reactivated." : "deactivated. They no longer appear in dropdowns and cannot sign in."}`,
    ]);
    load();
  };

  const doRevokeLogin = async () => {
    if (!accSelected) return;
    setAccBusy(true);
    const res = await revokeLogin({ profileId: String(accSelected.id) });
    setAccBusy(false);
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    app.pushToasts([`Login revoked for ${accSelected.full_name}. Their sessions are terminated.`]);
    load();
  };

  const doSetPassword = async () => {
    if (!accSelected) return;
    setAccBusy(true);
    const res = await setUserPassword({ profileId: String(accSelected.id), password: accPassword });
    setAccBusy(false);
    if (res.error) {
      app.pushToasts([res.error]);
      return;
    }
    app.pushToasts([`Password updated for ${accSelected.full_name}. Share it with them securely.`]);
    setAccPassword("");
  };

  const q = app.query.trim().toLowerCase();
  const filtered = sortRoster(
    q
      ? roster.filter((r) =>
          Object.values(r).some((v) => v != null && typeof v !== "object" && String(v).toLowerCase().includes(q))
        )
      : roster
  );

  const noLogin = roster.filter((r) => !r.user_id);
  const tb = boards?.teams || [];
  const lb = boards?.leadgen || [];
  const cb = boards?.closers || [];
  const anyTeam = tb.some((r) => r.leads || r.sqls || r.won || r.lost);
  const cbBadge = closerBadges(cb);
  const lbBadge = leadBadges(lb);

  const inputStyle: React.CSSProperties = {
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13.5,
    color: C.ink,
    background: C.surface,
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div className="app-page">
      <div style={{ marginBottom: 14 }}>
        <Panel title={"Team Leaderboard · " + app.tf} color={C.blueDeep}>
          {anyTeam ? (
            tb.map((r, i) => {
              const rate = r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 100) : 0;
              return (
                <LBRow
                  key={r.team}
                  i={i}
                  isLast={i === tb.length - 1}
                  name={r.team}
                  badge={i === 0 && r.won > 0 ? { e: "\u{1F3C6}", t: "Top Team" } : null}
                  rateText={rate + "% win"}
                  chips={[
                    { t: r.leads + " leads", tone: NEUTRAL_CHIP },
                    { t: r.sqls + " SQLs", tone: TONES.info },
                    { t: r.won + " won", tone: TONES.good },
                    { t: r.lost + " lost", tone: TONES.bad },
                  ]}
                />
              );
            })
          ) : (
            <div style={{ fontSize: 13, color: C.inkFaint }}>No team activity in this timeframe.</div>
          )}
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkFaint, marginTop: 8 }}>
            Ranked by deals won, then SQLs. Each figure is credited to the pod whose agent generated the lead.
          </div>
        </Panel>
      </div>

      <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <Panel title={"Lead Gen Agents · " + app.tf} color={C.blue}>
          {lb.length ? (
            lb.map((r, i) => (
              <LBRow
                key={r.name}
                i={i}
                isLast={i === lb.length - 1}
                name={r.name}
                badge={lbBadge(r)}
                rateText={r.rate + "% qual"}
                chips={[
                  { t: r.leads + " leads", tone: NEUTRAL_CHIP },
                  { t: r.q + " qualified", tone: TONES.good },
                  { t: r.rej + " rejected", tone: TONES.bad },
                ]}
              />
            ))
          ) : (
            <div style={{ fontSize: 13, color: C.inkFaint }}>No lead activity in this timeframe.</div>
          )}
        </Panel>
        <Panel title={"Closers · " + app.tf} color={C.ink}>
          {cb.length ? (
            cb.map((r, i) => (
              <LBRow
                key={r.name}
                i={i}
                isLast={i === cb.length - 1}
                name={r.name}
                badge={cbBadge(r)}
                rateText={r.rate + "% win"}
                chips={[
                  { t: r.w + " won", tone: TONES.good },
                  { t: r.a + " assigned", tone: NEUTRAL_CHIP },
                  { t: r.l + " lost", tone: TONES.bad },
                ]}
              />
            ))
          ) : (
            <div style={{ fontSize: 13, color: C.inkFaint }}>No closer activity in this timeframe.</div>
          )}
        </Panel>
      </div>

      {isAdmin ? (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Create Login · admin only" color={C.blueDeep}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <KeyRound size={16} style={{ color: C.blueDeep, flexShrink: 0 }} />
              <select value={selProfile} onChange={(e) => setSelProfile(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">Pick a team member&hellip;</option>
                {noLogin.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.full_name)} — {String(p.title)}
                  </option>
                ))}
              </select>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ ...inputStyle, minWidth: 200 }}
              />
              <input
                type="password"
                placeholder="Password (min 8 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, minWidth: 180 }}
              />
              <button
                onClick={createLogin}
                disabled={creating}
                className="btnp"
                style={{
                  border: "none",
                  background: "linear-gradient(180deg,#ba161c,#8e1015)",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: creating ? "default" : "pointer",
                  opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? "Creating..." : "Create login"}
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8 }}>
              Creates an email + password account and links it to the roster profile. The person signs in at /login. Access follows the profile&apos;s role.
            </div>
          </Panel>
        </div>
      ) : null}

      {isAdmin ? (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Manage Access · admin only" color={TONES.bad.fg}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <ShieldOff size={16} style={{ color: TONES.bad.fg, flexShrink: 0 }} />
              <select value={accProfile} onChange={(e) => setAccProfile(e.target.value)} style={{ ...inputStyle, minWidth: 240 }}>
                <option value="">Pick a team member&hellip;</option>
                {roster.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {String(p.full_name)} — {p.is_active === false ? "inactive" : "active"}
                    {p.user_id ? ", has login" : ", no login"}
                  </option>
                ))}
              </select>
              <button
                onClick={toggleActive}
                disabled={!accSelected || accBusy}
                style={{
                  border: `1px solid ${C.line}`,
                  background: C.surface,
                  color: accSelected && accSelected.is_active === false ? TONES.good.fg : TONES.warn.fg,
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !accSelected || accBusy ? "default" : "pointer",
                  opacity: !accSelected || accBusy ? 0.6 : 1,
                }}
              >
                {accBusy ? "Working..." : accSelected && accSelected.is_active === false ? "Reactivate" : "Deactivate"}
              </button>
              <button
                onClick={doRevokeLogin}
                disabled={!accSelected || !accSelected.user_id || accBusy}
                style={{
                  border: `1px solid ${TONES.bad.fg}55`,
                  background: TONES.bad.bg,
                  color: TONES.bad.fg,
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !accSelected || !accSelected.user_id || accBusy ? "default" : "pointer",
                  opacity: !accSelected || !accSelected.user_id || accBusy ? 0.6 : 1,
                }}
              >
                Revoke login
              </button>
              <input
                type="password"
                placeholder="New password (min 8 chars)"
                value={accPassword}
                onChange={(e) => setAccPassword(e.target.value)}
                disabled={!accSelected || !accSelected.user_id}
                style={{ ...inputStyle, minWidth: 180, opacity: !accSelected || !accSelected.user_id ? 0.6 : 1 }}
              />
              <button
                onClick={doSetPassword}
                disabled={!accSelected || !accSelected.user_id || accPassword.length < 8 || accBusy}
                style={{
                  border: `1px solid ${C.line}`,
                  background: C.surface,
                  color: C.blueDeep,
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !accSelected || !accSelected.user_id || accPassword.length < 8 || accBusy ? "default" : "pointer",
                  opacity: !accSelected || !accSelected.user_id || accPassword.length < 8 || accBusy ? 0.6 : 1,
                }}
              >
                {accBusy ? "Setting..." : "Set password"}
              </button>
              <div style={{ flex: 1 }} />
              <button
                onClick={openAdd}
                className="btnp"
                style={{
                  border: "none",
                  background: "linear-gradient(180deg,#ba161c,#8e1015)",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  boxShadow: "0 6px 16px rgba(196,19,47,0.28)",
                }}
              >
                <Plus size={15} /> Add team member
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 8 }}>
              Deactivating removes the person from assignment dropdowns and blocks sign-in, but keeps their history. Revoking a login deletes the account and ends all their sessions; the roster profile stays and a new login can be created later. Passwords are stored encrypted and can never be viewed &mdash; use Set password to give someone a fresh one.
            </div>
          </Panel>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
          Team roster
          {rosterLoading ? "" : filtered.length ? ` · ${filtered.length}` : ""}
        </div>
        <button
          type="button"
          onClick={() => downloadRosterCsv(filtered, fields)}
          disabled={rosterLoading || !filtered.length}
          style={{
            border: `1px solid ${C.line}`,
            background: C.surface,
            color: C.ink,
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 700,
            cursor: !rosterLoading && filtered.length ? "pointer" : "default",
            opacity: !rosterLoading && filtered.length ? 1 : 0.5,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Download size={15} /> Export CSV
        </button>
      </div>

      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 12px 34px rgba(46,4,10,0.30)",
        }}
      >
        {rosterLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: "72px 24px",
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
            <div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>Loading team roster…</div>
            <div style={{ fontSize: 12.5, color: C.inkFaint }}>Fetching members and login status</div>
          </div>
        ) : (
          <DataTable
            fields={fields}
            rows={filtered}
            onRow={(r) => setDrawer({ record: r, isNew: false })}
            groupOf={rosterGroup}
            rowActionsLabel="View as"
            rowActions={
              canViewAs
                ? (r) => {
                    const can =
                      !!r.user_id &&
                      r.is_active !== false &&
                      String(r.id) !== app.session.profile.id;
                    if (!can) {
                      return <span style={{ color: C.inkFaint, fontSize: 12 }}>—</span>;
                    }
                    const busy = viewAsBusy === String(r.id);
                    return (
                      <button
                        type="button"
                        disabled={!!viewAsBusy}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setViewAsBusy(String(r.id));
                          const res = await startViewAs({ profileId: String(r.id) });
                          if (res?.error) {
                            pushToasts([res.error]);
                            setViewAsBusy(null);
                          }
                        }}
                        style={{
                          border: `1px solid ${C.line}`,
                          background: C.surface,
                          color: C.ink,
                          borderRadius: 8,
                          padding: "5px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: viewAsBusy ? "default" : "pointer",
                          opacity: busy ? 0.7 : 1,
                        }}
                      >
                        {busy ? "Opening…" : "View as"}
                      </button>
                    );
                  }
                : undefined
            }
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
          readOnly={!canEdit}
          manager={app.isManager}
          canDelete={isAdmin}
          viewTabs={app.viewTabs}
          onClose={() => setDrawer(null)}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : null}
    </div>
  );
}
