"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { C, TONES } from "@/lib/theme";
import { num } from "@/lib/format";
import { useApp } from "@/components/app-context";
import { KpiCard, Panel } from "@/components/dash";
import Pill from "@/components/Pill";
import { fetchOpsKpi, fetchMspFatalLeads } from "@/actions/dashboard";

export default function OpsKpiPage() {
  const app = useApp();
  const router = useRouter();
  const [d, setD] = useState<Record<string, unknown> | null>(null);
  const [fatalLeads, setFatalLeads] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchOpsKpi({ tf: app.tf }), fetchMspFatalLeads()]).then(([res, fl]) => {
      if (!alive) return;
      if (res.error) app.pushToasts([res.error]);
      else setD(res.data || null);
      setFatalLeads(fl.leadIds);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.tf]);

  if (!app.viewTabs.includes("opskpi")) {
    return <div className="app-gate">This tab is not visible to your role.</div>;
  }
  if (!d) {
    return <div className="app-gate">Loading&hellip;</div>;
  }

  const cs = (d.cs || {}) as Record<string, number | null>;
  const reviewed = num(d.reviewed);
  const passes = num(d.passes);
  const acc = reviewed ? Math.round((passes / reviewed) * 1000) / 10 : null;
  const onbTotal = num(d.onbTotal);
  const onbApp = num(d.onbApproved);
  const onbRate = onbTotal ? Math.round((onbApp / onbTotal) * 100) : null;
  const fatals = num(d.fatals);
  const equipped = num(d.equipped);
  const equip48 = num(d.equip48);
  const equipRate = equipped ? Math.round((equip48 / equipped) * 100) : null;
  const retRate = cs.retentionRate ?? null;
  const churnRate = cs.churnRate ?? null;
  const csD = num(cs.funded);

  const rows: { cat: string; metric: string; target: string; actual: string; met: boolean | null }[] = [
    { cat: "Onboarding Efficiency", metric: "Onboarding attempts within 24h (fatal errors)", target: "0 fatal", actual: fatals + " fatal", met: fatals === 0 },
    { cat: "", metric: "Approval Rate", target: "85%", actual: onbRate === null ? "-" : onbRate + "%", met: onbRate === null ? null : onbRate >= 85 },
    { cat: "", metric: "Equipment Verification within 48h", target: "48 Hours", actual: equipRate === null ? "-" : equipRate + "%", met: equipRate === null ? null : equipRate >= 90 },
    { cat: "Quality", metric: "OPS QA Accuracy", target: "95%", actual: acc === null ? "-" : acc + "%", met: acc === null ? null : acc >= 95 },
    { cat: "Follow-up & Ownership", metric: "End-to-End Case Ownership", target: "100%", actual: "100%", met: true },
    { cat: "Customer Success", metric: "Retention Rate (Active / funded this period)", target: "85%", actual: retRate === null ? "-" : retRate + "%", met: retRate === null ? null : num(retRate) >= 85 },
    { cat: "", metric: "Churn Rate (Churned / funded this period)", target: "< 10%", actual: churnRate === null ? "-" : churnRate + "%", met: churnRate === null ? null : num(churnRate) < 10 },
    { cat: "", metric: "At Risk (potential chargebacks / funded)", target: "monitor", actual: cs.atRiskRate === null || cs.atRiskRate === undefined ? "-" : cs.atRiskRate + "%", met: null },
    { cat: "", metric: "Buy-back / Chargeback (Chargeback / funded)", target: "monitor", actual: cs.buybackRate === null || cs.buybackRate === undefined ? "-" : cs.buybackRate + "%", met: null },
    { cat: "", metric: "Closed by MSP (Closed by MSP / funded)", target: "monitor", actual: cs.closedMspRate === null || cs.closedMspRate === undefined ? "-" : cs.closedMspRate + "%", met: null },
  ];

  return (
    <div style={{ padding: "22px 26px" }}>
      <div className="app-page-head">
        <div className="app-page-title">
          <TrendingUp size={22} style={{ color: C.blue }} />
          OPS KPIs
        </div>
        <div className="app-page-lede">&middot; {app.tf}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Onboarding Approval" value={onbRate === null ? "-" : onbRate + "%"} target="≥ 85%" met={onbRate === null ? null : onbRate >= 85} sub={onbApp + " of " + onbTotal} />
        <KpiCard label="Onboarding SLA" value={fatals} target="0 fatal errors" met={fatals === 0} glow sub="late 2nd/3rd attempts" />
        <KpiCard label="OPS QA Accuracy" value={acc === null ? "No checks" : acc + "%"} target="≥ 95%" met={acc === null ? null : acc >= 95} glow sub={reviewed + " checked"} />
        <KpiCard label="Retention Rate" value={retRate === null ? "-" : retRate + "%"} target="≥ 85%" met={retRate === null ? null : num(retRate) >= 85} sub={"Active " + num(cs.active) + " of " + csD + " funded"} />
        <KpiCard label="Churn Rate" value={churnRate === null ? "-" : churnRate + "%"} target="< 10%" met={churnRate === null ? null : num(churnRate) < 10} sub={num(cs.churned) + " churned of " + csD} />
        <KpiCard label="At Risk" value={cs.atRiskRate === null || cs.atRiskRate === undefined ? "-" : cs.atRiskRate + "%"} target="monitor" met={null} sub={num(cs.atRisk) + " potential chargebacks"} />
        <KpiCard label="Buy-back / Chargeback" value={cs.buybackRate === null || cs.buybackRate === undefined ? "-" : cs.buybackRate + "%"} target="monitor" met={null} sub={num(cs.chargeback) + " of " + csD + " funded"} />
      </div>
      {fatalLeads.length ? (
        <div style={{ marginBottom: 20 }}>
          <Panel title={"Fatal SLA Breaches · " + fatalLeads.length + " lead" + (fatalLeads.length === 1 ? "" : "s") + " need action now"} color={TONES.bad.fg}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <AlertTriangle size={16} style={{ color: TONES.bad.fg, flexShrink: 0 }} />
              {fatalLeads.map((id) => (
                <button
                  key={id}
                  className="mono jny"
                  onClick={
                    app.viewTabs.includes("msp")
                      ? () => {
                          app.jumpTo("msp", id);
                          router.push("/msp");
                        }
                      : undefined
                  }
                  title={app.viewTabs.includes("msp") ? "Open this record in Onboarding" : "Onboarding is not visible to your role"}
                  style={{
                    border: `1px solid ${TONES.bad.fg}55`,
                    background: TONES.bad.bg,
                    color: TONES.bad.fg,
                    borderRadius: 8,
                    padding: "5px 11px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: app.viewTabs.includes("msp") ? "pointer" : "default",
                  }}
                >
                  {id}
                </button>
              ))}
              <span style={{ fontSize: 12, color: C.inkFaint }}>
                A failed attempt was left without a follow-up for more than 24 hours.
              </span>
            </div>
          </Panel>
        </div>
      ) : null}

      <Panel title="Key Performance Indicators (KPIs) - Onboarding team" color={C.blueDeep}>
        <div className="overflow-auto">
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 13 }}>
            <thead>
              <tr>
                {["Category", "Metric", "Target", "Actual", "Score"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      background: C.lineSoft,
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
              {rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 ? C.bg : C.surface }}>
                  <td style={{ padding: "9px 12px", fontWeight: 700, color: C.ink, borderBottom: `1px solid ${C.lineSoft}` }}>{r.cat}</td>
                  <td style={{ padding: "9px 12px", color: C.ink, borderBottom: `1px solid ${C.lineSoft}` }}>{r.metric}</td>
                  <td style={{ padding: "9px 12px", color: C.inkSoft, borderBottom: `1px solid ${C.lineSoft}` }}>{r.target}</td>
                  <td className="mono" style={{ padding: "9px 12px", fontWeight: 700, color: C.ink, borderBottom: `1px solid ${C.lineSoft}` }}>{r.actual}</td>
                  <td style={{ padding: "9px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                    {r.met === null ? <span style={{ color: C.inkFaint }}>-</span> : <Pill value={r.met ? "On Track" : "Fatal Error"} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
