"use client";

// Header control: start General / Lunch break, or end current break.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Utensils, Pause, X } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import {
  endBreak,
  fetchMyPresence,
  startBreak,
  type BreakType,
} from "@/actions/presence";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";

const BREAKS: { type: BreakType; label: string; icon: React.ReactNode }[] = [
  { type: "general", label: "Break", icon: <Pause size={14} /> },
  { type: "lunch", label: "Lunch break", icon: <Utensils size={14} /> },
];

function labelOf(type: string): string {
  if (type === "lunch") return "Lunch break";
  if (type === "general" || type === "tea" || type === "smoke") return "Break";
  return "On break";
}

function fmtElapsed(startedAt: string | null | undefined): string {
  if (!startedAt) return "";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${s}s`;
}

export default function BreakControl() {
  const app = useApp();
  const userId = app.session.userId;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [breakType, setBreakType] = useState("");
  const [breakStartedAt, setBreakStartedAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    fetchMyPresence().then((res) => {
      if (res.error) return;
      if (res.status === "break" && res.breakType) {
        setBreakType(res.breakType);
        setBreakStartedAt(res.breakStartedAt || null);
        return;
      }
      // Keep local break UI if server briefly looks offline (remount blip).
      if (res.status === "offline") return;
      setBreakType("");
      setBreakStartedAt(null);
    });
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(load, 1500);
    const t = window.setInterval(load, 60_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    if (!breakType) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [breakType]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("my-break-presence")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_presence",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Own heartbeats also UPDATE this row — debounce so we don't hit /ceo every pulse.
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => load(), 5_000);
        }
      )
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onStart = async (type: BreakType) => {
    setBusy(true);
    const res = await startBreak(type);
    setBusy(false);
    setOpen(false);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    setBreakType(type);
    setBreakStartedAt(new Date().toISOString());
  };

  const onEnd = async () => {
    setBusy(true);
    const res = await endBreak();
    setBusy(false);
    if (res.error) {
      window.alert(res.error);
      return;
    }
    setBreakType("");
    setBreakStartedAt(null);
  };

  void tick; // re-render elapsed clock

  if (breakType) {
    return (
      <button
        type="button"
        onClick={() => void onEnd()}
        disabled={busy}
        title="End break"
        style={{
          border: `1px solid ${TONES.info.fg}`,
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12.5,
          fontWeight: 800,
          color: TONES.info.fg,
          background: TONES.info.bg,
          cursor: busy ? "default" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          whiteSpace: "nowrap",
        }}
      >
        {breakType === "lunch" ? <Utensils size={14} /> : <Pause size={14} />}
        {labelOf(breakType)}
        <span className="mono" style={{ fontWeight: 700, opacity: 0.85 }}>
          {fmtElapsed(breakStartedAt)}
        </span>
        <X size={13} />
      </button>
    );
  }

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="Start a break"
        className="app-control"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 12.5,
        }}
      >
        <Pause size={14} style={{ color: C.inkSoft }} />
        Break
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 40,
            minWidth: 180,
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            boxShadow: "0 12px 28px rgba(18,21,26,0.14)",
            padding: 6,
          }}
        >
          {BREAKS.map((b) => (
            <button
              key={b.type}
              type="button"
              disabled={busy}
              onClick={() => void onStart(b.type)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: "none",
                background: "transparent",
                borderRadius: 8,
                padding: "9px 10px",
                fontSize: 13,
                fontWeight: 700,
                color: C.ink,
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C.bg;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ color: C.inkSoft }}>{b.icon}</span>
              {b.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
