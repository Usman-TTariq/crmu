"use client";

// Admin header badge: idle + away count, links to Employee Monitor.
// Refreshes on Supabase Realtime user_presence changes (+ slow poll fallback).

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { useApp } from "@/components/app-context";
import { createClient } from "@/lib/supabase/client";
import { fetchPresenceBoard } from "@/actions/presence";

export default function PresenceBadge() {
  const app = useApp();
  const router = useRouter();
  const [alerts, setAlerts] = useState(0);

  const load = useCallback(() => {
    if (!app.canSeeMonitor) return;
    fetchPresenceBoard().then((res) => {
      const n = (res.rows || []).filter((r) => r.status === "idle" || r.status === "away").length;
      setAlerts(n);
    });
  }, [app.canSeeMonitor]);

  useEffect(() => {
    load();
    // Fallback if Realtime publication / SQL not applied yet
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!app.canSeeMonitor) return;
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => load(), 400);
    };

    const channel = supabase
      .channel("presence-badge-alerts")
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
  }, [app.canSeeMonitor, load]);

  if (!app.canSeeMonitor) return null;

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
      <span className="app-seat-label" style={{ fontSize: 12, fontWeight: 700 }}>
        seat alerts
      </span>
    </button>
  );
}
