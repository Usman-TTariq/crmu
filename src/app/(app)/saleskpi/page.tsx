"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { num } from "@/lib/format";
import { useApp } from "@/components/app-context";
import { KpiCard } from "@/components/dash";
import { fetchSalesKpi } from "@/actions/dashboard";

export default function SalesKpiPage() {
  const app = useApp();
  const [d, setD] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSalesKpi({ tf: app.tf }).then((res) => {
      if (!alive) return;
      if (res.error) app.pushToasts([res.error]);
      else setD(res.data || null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.tf]);

  if (!app.viewTabs.includes("saleskpi")) {
    return <div style={{ padding: 40, color: "#fff", fontWeight: 600 }}>This tab is not visible to your role.</div>;
  }
  if (!d) {
    return <div style={{ padding: 40, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>Loading&hellip;</div>;
  }

  const qaTotal = num(d.qaTotal);
  const qualified = num(d.qualified);
  const decided = num(d.decided);
  const won = num(d.won);
  const qualRate = qaTotal ? Math.round((qualified / qaTotal) * 100) : 0;
  const winRate = decided ? Math.round((won / decided) * 100) : 0;

  return (
    <div style={{ padding: "22px 26px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <TrendingUp size={20} style={{ color: "#FFFFFF" }} />
        <div style={{ fontSize: 20, fontWeight: 800, color: "#FFFFFF" }}>Sales KPIs</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}>&middot; {app.tf}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        <KpiCard
          label="Lead Qualification Rate"
          value={qualRate + "%"}
          target="\u2265 60%"
          met={qaTotal ? qualRate >= 60 : null}
          sub={qualified + " of " + qaTotal}
        />
        <KpiCard
          label="Closer Win Rate"
          value={winRate + "%"}
          target="\u2265 50%"
          met={decided ? winRate >= 50 : null}
          sub={won + " won of " + decided + " decided"}
        />
      </div>
      <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.75)" }}>
        Sales QA does not have accuracy KPIs yet. These two will expand as you define more.
      </div>
    </div>
  );
}
