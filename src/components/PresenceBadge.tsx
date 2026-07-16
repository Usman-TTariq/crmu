"use client";

// Admin header badge: idle + away count, links to Employee Monitor.

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { useApp } from "@/components/app-context";
import { fetchPresenceBoard } from "@/actions/presence";

export default function PresenceBadge() {
  const app = useApp();
  const router = useRouter();
  const [alerts, setAlerts] = useState(0);

  const load = useCallback(() => {
    if (!app.canSeeCeo) return;
    fetchPresenceBoard().then((res) => {
      const n = (res.rows || []).filter((r) => r.status === "idle" || r.status === "away").length;
      setAlerts(n);
    });
  }, [app.canSeeCeo]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!app.canSeeCeo) return null;

  return (
    <button
      type="button"
      title="Open Employee Monitor"
      onClick={() => router.push("/monitor")}
      style={{
        border: `1px solid ${alerts > 0 ? TONES.warn.fg : C.line}`,
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        color: alerts > 0 ? TONES.warn.fg : C.ink,
        background: alerts > 0 ? TONES.warn.bg : "#fff",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 7,
        boxShadow: "0 1px 2px rgba(18,21,26,0.04)",
      }}
    >
      <Activity size={15} />
      <span
        className="mono"
        style={{
          background: alerts > 0 ? TONES.bad.fg : C.inkSoft,
          color: "#fff",
          borderRadius: 20,
          padding: "0px 7px",
          fontSize: 11.5,
          fontWeight: 800,
        }}
      >
        {alerts}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700 }}>seat alerts</span>
    </button>
  );
}
