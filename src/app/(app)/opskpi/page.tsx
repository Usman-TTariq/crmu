"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { C } from "@/lib/theme";
import { num } from "@/lib/format";
import { useApp } from "@/components/app-context";
import { KpiCard, Panel } from "@/components/dash";
import Pill from "@/components/Pill";
import { fetchOpsKpi } from "@/actions/dashboard";

export default function OpsKpiPage() {
  const app = useApp();
  const [d, setD] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    fetchOpsKpi({ tf: app.tf }).then((res) => {
      if (!alive) return;
      if (res.error) app.pushToasts([res.error]);
      else setD(res.data || null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.tf]);

  if (!app.viewTabs.includes("opskpi")) {
    return <div style={{ padding: 40, color: "#fff", fontWeight: 600 }}>This tab is not visible to your role.</div>;
  }
  if (!d) {
    return <div style={{ padding: 40, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>Loading&hellip;</div>;
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
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <TrendingUp size={20} style={{ color: "#FFFFFF" }} />
        <div style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF" }}>OPS KPIs</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}>&middot; {app.tf}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 20 }}>
        <KpiCard label="Onboarding Approval" value={onbRate === null ? "-" : onbRate + "%"} target="\u2265 85%" met={onbRate === null ? null : onbRate >= 85} sub={onbApp + " of " + onbTotal} />
        <KpiCard label="Onboarding SLA" value={fatals} target="0 fatal errors" met={fatals === 0} glow sub="late 2nd/3rd attempts" />
        <KpiCard label="OPS QA Accuracy" value={acc === null ? "No checks" : acc + "%"} target="\u2265 95%" met={acc === null ? null : acc >= 95} glow sub={reviewed + " checked"} />
        <KpiCard label="Retention Rate" value={retRate === null ? "-" : retRate + "%"} target="\u2265 85%" met={retRate === null ? null : num(retRate) >= 85} sub={"Active " + num(cs.active) + " of " + csD + " funded"} />
        <KpiCard label="Churn Rate" value={churnRate === null ? "-" : churnRate + "%"} target="< 10%" met={churnRate === null ? null : num(churnRate) < 10} sub={num(cs.churned) + " churned of " + csD} />
        <KpiCard label="At Risk" value={cs.atRiskRate === null || cs.atRiskRate === undefined ? "-" : cs.atRiskRate + "%"} target="monitor" met={null} sub={num(cs.atRisk) + " potential chargebacks"} />
        <KpiCard label="Buy-back / Chargeback" value={cs.buybackRate === null || cs.buybackRate === undefined ? "-" : cs.buybackRate + "%"} target="monitor" met={null} sub={num(cs.chargeback) + " of " + csD + " funded"} />
      </div>
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
