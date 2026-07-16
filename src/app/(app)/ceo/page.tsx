"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { C, TONES, toneFor, NEUTRAL_CHIP } from "@/lib/theme";
import { money, num, dd, today } from "@/lib/format";
import { useApp } from "@/components/app-context";
import { Stat, Bar, Panel, Donut, FunnelChart, SegmentedDonut, LBRow, type FunnelStep, type Badge } from "@/components/dash";
import Pill from "@/components/Pill";
import { fetchCeoPage, type BoardCloserRow } from "@/actions/dashboard";

type Ceo = Record<string, unknown>;

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

export default function CeoDashboardPage() {
  const app = useApp();
  const router = useRouter();
  const [d, setD] = useState<Ceo | null>(null);
  const [closers, setClosers] = useState<BoardCloserRow[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCeoPage({ tf: app.tf }).then((res) => {
      if (!alive) return;
      if (res.error) setErr(res.error);
      else setD(res.data || null);
      setClosers(res.closers);
    });
    return () => {
      alive = false;
    };
  }, [app.tf]);

  if (!app.canSeeCeo) {
    return <div className="app-gate">The CEO dashboard is restricted.</div>;
  }
  if (err) {
    return <div className="app-gate">{err}</div>;
  }
  if (!d) {
    return <div className="app-gate">Loading&hellip;</div>;
  }

  const n = (k: string) => num(d[k]);
  const nav = (tk: string) => router.push(`/${tk}`);
  const cs = (d.cs || {}) as Record<string, number | null>;
  const qualRate = n("qaTotal") ? Math.round((n("qaQualified") / n("qaTotal")) * 100) : 0;
  const revenue = n("revenue");
  const leaseTarget = 10000;
  const leasePct = Math.min(100, Math.round((revenue / leaseTarget) * 100));
  const opsRate = n("opsAll") ? Math.round((n("opsApproved") / n("opsAll")) * 100) : 0;
  const onbRateAll = n("onbAll") ? (n("onbApproved") / n("onbAll")) * 100 : null;
  const funnel = (d.funnel || []) as FunnelStep[];
  const sources = (d.leadSources || []) as { label: string; count: number }[];
  const mspRates = (d.mspRates || []) as { name: string; rate: number }[];
  const leaseRates = (d.leaseRates || []) as { name: string; rate: number }[];
  const drops = (d.dropOffs || []) as { label: string; n: number }[];
  const stageCounts = (d.stageCounts || []) as { stage: string; n: number }[];
  const stageMax = Math.max(1, ...stageCounts.map((x) => x.n));
  const dropMax = Math.max(1, ...drops.map((x) => x.n));
  const anyDrop = drops.some((x) => x.n > 0);
  const recent = (d.recent || []) as Record<string, string>[];
  const badgeFor = closerBadges(closers);
  const csD = num(cs.funded);

  return (
    <div style={{ padding: "22px 26px" }}>
      <div className="app-page-head">
        <div className="app-page-title">TGT Nexus</div>
        <div className="app-page-lede">
          CEO dashboard &middot; live &middot; {app.tf}
        </div>
      </div>

      <div
        className="fade-up"
        style={{
          backgroundImage:
            "radial-gradient(900px 320px at 88% -30%, rgba(255,255,255,0.12), transparent 60%), linear-gradient(135deg, #0a0d12 0%, #151b24 45%, #8e1015 100%)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 16px 44px rgba(18,21,26,0.22)",
          borderRadius: 18,
          padding: "20px 24px",
          color: "#fff",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 24,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", opacity: 0.75, textTransform: "uppercase" }}>
            Funded lease volume vs target
          </div>
          <div className="mono" style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>
            {money(revenue)} <span style={{ fontSize: 16, opacity: 0.7, fontWeight: 600 }}>/ {money(leaseTarget)}</span>
          </div>
          <div style={{ height: 9, background: "rgba(255,255,255,0.18)", borderRadius: 6, overflow: "hidden", marginTop: 12 }}>
            <div className="bar-fill" style={{ height: "100%", width: leasePct + "%", background: C.accentOnDark, borderRadius: 6 }} />
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
            {leasePct}% of target &middot; {money(Math.max(0, leaseTarget - revenue))} remaining
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { l: "Funded Leases", v: n("fundedLeases"), tk: "leasing" },
            { l: "Approved MIDs", v: n("approvedMids"), tk: "msp" },
            { l: "Live Merchants", v: n("live"), tk: "fulfillment" },
          ].map((c) => (
            <div
              key={c.l}
              onClick={() => nav(c.tk)}
              role="button"
              className="jny"
              style={{
                background: "rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "14px 18px",
                textAlign: "center",
                minWidth: 96,
                cursor: "pointer",
              }}
            >
              <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: C.accentOnDark }}>
                {c.v}
              </div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{c.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14, marginBottom: 14 }}>
        <Stat label="Leads" value={n("leads")} sub={app.tf.toLowerCase()} onClick={() => nav("leadgen")} />
        <Stat label="QA Passed" value={n("qaQualified")} tone={TONES.good.fg} sub={qualRate + "% qual rate"} onClick={() => nav("qa")} />
        <Stat label="Rejected by QA" value={n("qaRejected")} tone={n("qaRejected") ? TONES.bad.fg : C.ink} sub="kept in history" onClick={() => nav("qa")} />
        <Stat label="SQLs Assigned" value={n("sqlsAssigned")} onClick={() => nav("sqlassign")} />
        <Stat label="Closed Won" value={n("won")} tone={TONES.good.fg} onClick={() => nav("closer")} />
        <Stat label="Closed Lost" value={n("lost")} tone={n("lost") ? TONES.bad.fg : C.ink} onClick={() => nav("closer")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Panel title="Conversion Funnel · lead to live · all time" color={C.blueDeep}>
            <FunnelChart steps={funnel} />
          </Panel>
          <Panel title="Lead Source Mix · where leads come from" color={C.blue}>
            <SegmentedDonut centerLabel="LEADS" items={sources.filter((x) => x.count > 0)} />
          </Panel>
          <Panel title="MSP Approval Rates" color="#6D28D9" style={{ flex: 1 }}>
            {mspRates.length ? (
              mspRates.map((r) => <Bar key={r.name} label={r.name} value={r.rate} max={100} color="#6D28D9" suffix="%" />)
            ) : (
              <div style={{ fontSize: 13, color: C.inkFaint }}>No onboarding attempts yet.</div>
            )}
          </Panel>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Panel title="Health Rings" color={C.ink}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              <Donut
                value={n("qaTotal") ? qualRate : null}
                label="QA Qualification"
                sub={`target 60% · ${app.tf.toLowerCase()}`}
                color={qualRate >= 60 ? TONES.good.fg : C.blue}
              />
              <Donut
                value={n("opsAll") ? opsRate : null}
                label="OPS Approval"
                sub="all time"
                color={opsRate >= 85 ? TONES.good.fg : C.blue}
              />
              <Donut
                value={onbRateAll}
                label="Onboarding Approval"
                sub="target 85% · all time"
                color={onbRateAll !== null && onbRateAll >= 85 ? TONES.good.fg : C.blue}
              />
              <Donut
                value={cs.retentionRate ?? null}
                label="Retention"
                sub={"target 85% · " + app.tf.toLowerCase()}
                color={cs.retentionRate !== null && num(cs.retentionRate) >= 85 ? TONES.good.fg : C.blue}
              />
            </div>
          </Panel>
          <Panel title="Deal Stage Mix" color="#1E7A47">
            {stageCounts
              .filter((x) => x.n > 0)
              .map((x) => (
                <Bar key={x.stage} label={x.stage} value={x.n} max={stageMax} color={toneFor(x.stage).fg} />
              ))}
          </Panel>
          <Panel title="Where Leads Drop Off" color={C.ink}>
            {anyDrop ? (
              drops.map((x) => <Bar key={x.label} label={x.label} value={x.n} max={dropMax} color={x.n ? TONES.bad.fg : C.line} />)
            ) : (
              <div style={{ fontSize: 13, color: C.inkFaint }}>No losses recorded anywhere. Clean pipeline.</div>
            )}
          </Panel>
          <Panel title="Leasing Approval Rates" color="#1F7A8C" style={{ flex: 1 }}>
            {leaseRates.length ? (
              leaseRates.map((r) => <Bar key={r.name} label={r.name} value={r.rate} max={100} color="#1F7A8C" suffix="%" />)
            ) : (
              <div style={{ fontSize: 13, color: C.inkFaint }}>No leasing records yet.</div>
            )}
          </Panel>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Panel title={"Customer Success Portfolio (OPS QA) · " + app.tf + " · funded this period = " + csD} color={C.blueDeep}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            {[
              { label: "Retention", val: cs.retentionRate, nn: num(cs.active), tone: TONES.good },
              { label: "Churn", val: cs.churnRate, nn: num(cs.churned), tone: TONES.bad },
              { label: "At Risk", val: cs.atRiskRate, nn: num(cs.atRisk), tone: TONES.warn },
              { label: "Buy-back", val: cs.buybackRate, nn: num(cs.chargeback), tone: TONES.bad },
              { label: "Closed by MSP", val: cs.closedMspRate, nn: num(cs.closedMsp), tone: TONES.bad },
            ].map((m) => (
              <div key={m.label} style={{ background: m.tone.bg, borderRadius: 12, padding: "13px 12px", textAlign: "center" }}>
                <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: m.tone.fg }}>
                  {m.val === null || m.val === undefined ? "-" : m.val + "%"}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: C.ink, marginTop: 2 }}>{m.label}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkSoft, marginTop: 2 }}>
                  {m.nn} merchant{m.nn === 1 ? "" : "s"}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 14 }}>
        <Stat
          label="Lost After Onboarding"
          value={n("lostAfterOnb")}
          tone={n("lostAfterOnb") ? TONES.bad.fg : C.ink}
          sub="churned or cancelled merchants"
          onClick={() => nav("retention")}
        />
        <Stat
          label="At Risk (potential chargebacks)"
          value={cs.atRiskRate === null || cs.atRiskRate === undefined ? "-" : cs.atRiskRate + "%"}
          tone={num(cs.atRisk) ? TONES.warn.fg : C.ink}
          sub={num(cs.atRisk) + " of " + csD + " funded merchants"}
          onClick={() => nav("retention")}
        />
        <Stat
          label="Onboarding Fatal Errors"
          value={n("fatalCount")}
          tone={n("fatalCount") ? TONES.bad.fg : C.ink}
          sub="late attempt SLA breaches"
          onClick={() => nav("msp")}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
        <Panel title={"Closer Leaderboard · " + app.tf + " · top 5"} color={C.ink}>
          {closers.length ? (
            closers.slice(0, 5).map((r, i) => (
              <LBRow
                key={r.name}
                i={i}
                isLast={i === Math.min(5, closers.length) - 1}
                name={r.name}
                badge={badgeFor(r)}
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
          <button
            onClick={() => nav("teamsetup")}
            className="jny"
            style={{
              marginTop: 10,
              width: "100%",
              border: `1px solid ${C.line}`,
              background: C.surface,
              color: C.ink,
              borderRadius: 10,
              padding: "9px 12px",
              fontSize: 12.5,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            View full team leaderboards <ArrowRight size={14} />
          </button>
        </Panel>
        <Panel title="Recent Leads in Pipeline" color={C.blueDeep}>
          <div className="overflow-auto">
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
              <thead>
                <tr>
                  {["ID", "Business", "Stage", "Closer", "Days"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "6px 10px",
                        color: C.inkSoft,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        borderBottom: `1px solid ${C.line}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => {
                  const days = dd(r.assigned_date, today());
                  return (
                    <tr
                      key={i}
                      onClick={() => {
                        app.jumpTo("closer", r.lead_id);
                        nav("closer");
                      }}
                      className="crm-row"
                      style={{ cursor: "pointer" }}
                    >
                      <td className="mono" style={{ padding: "7px 10px", color: C.blue, fontWeight: 600, borderBottom: `1px solid ${C.lineSoft}` }}>
                        {r.lead_id}
                      </td>
                      <td style={{ padding: "7px 10px", color: C.ink, borderBottom: `1px solid ${C.lineSoft}` }}>{r.business_name}</td>
                      <td style={{ padding: "7px 10px", borderBottom: `1px solid ${C.lineSoft}` }}>
                        <Pill value={r.stage} />
                      </td>
                      <td style={{ padding: "7px 10px", color: C.ink, fontWeight: 600, fontSize: 13.5, borderBottom: `1px solid ${C.lineSoft}` }}>
                        {r.closer}
                      </td>
                      <td className="mono" style={{ padding: "7px 10px", color: C.ink, fontWeight: 700, borderBottom: `1px solid ${C.lineSoft}` }}>
                        {days === null ? "-" : days + "d"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

    </div>
  );
}
