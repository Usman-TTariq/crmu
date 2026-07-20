"use client";

// Admin header badge: Away count (or logged-in if none away).
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
  const [away, setAway] = useState(0);
  const [online, setOnline] = useState(0);

  const load = useCallback(() => {
    if (!app.canSeeMonitor) return;
    fetchPresenceBoard().then((res) => {
      const rows = res.rows || [];
      const onBreak = rows.filter((r) => r.status === "break").length;
      const awayN = rows.filter((r) => r.status === "away" || r.status === "idle").length;
      setAway(onBreak + awayN);
      setOnline(rows.filter((r) => r.status === "working").length);
    });
  }, [app.canSeeMonitor]);

  useEffect(() => {
    load();
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

  const alert = away > 0;
  const count = alert ? away : online;
  const label = alert ? "alerts" : "logged in";
  const tone = alert ? TONES.warn : TONES.good;

  return (
    <button
      type="button"
      title="Open Employee Monitor"
      onClick={() => router.push("/monitor")}
      style={{
        border: `1px solid ${count > 0 ? tone.fg : C.line}`,
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 13,
        fontWeight: 700,
        color: count > 0 ? tone.fg : C.ink,
        background: count > 0 ? tone.bg : "#fff",
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
          background: count > 0 ? tone.fg : C.inkSoft,
          color: "#fff",
          borderRadius: 20,
          padding: "0px 7px",
          fontSize: 11.5,
          fontWeight: 800,
        }}
      >
        {count}
      </span>
      <span className="app-seat-label" style={{ fontSize: 12, fontWeight: 700 }}>
        {label}
      </span>
    </button>
  );
}
