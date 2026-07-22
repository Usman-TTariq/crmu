"use client";

// Admin-only "Active Logins" dropdown for the top navbar. Shows every live
// session (person, device, IP, sign-in time, last activity) and lets the
// admin sign a person out of all their devices — or sign everyone out.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, LogOut, MonitorSmartphone, RefreshCw, ShieldAlert } from "lucide-react";
import { C, TONES } from "@/lib/theme";
import { useApp } from "@/components/app-context";
import {
  fetchActiveSessions,
  signOutUserEverywhere,
  signOutEveryone,
  type SessionRow,
} from "@/actions/dashboard";

// Human label for a raw user-agent string ("Chrome · Windows")
export function deviceOf(ua: string): string {
  if (!ua) return "Unknown device";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /iPhone|iPad/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
    ? "Android"
    : /Mac OS X|Macintosh/i.test(ua)
    ? "Mac"
    : /Linux/i.test(ua)
    ? "Linux"
    : "Other";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
    ? "Opera"
    : /Chrome\//i.test(ua)
    ? "Chrome"
    : /Safari\//i.test(ua) && /Version\//i.test(ua)
    ? "Safari"
    : /Firefox\//i.test(ua)
    ? "Firefox"
    : "Browser";
  return browser + " \u00B7 " + os;
}

export function ago(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  if (isNaN(ms)) return "-";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}

const fmtTs = (ts: string) => String(ts || "").slice(0, 16).replace("T", " ");

export default function ActiveLogins() {
  const app = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchActiveSessions().then((res) => {
      // The admin's own login is hidden — only other people's sessions matter here.
      setSessions(res.sessions.filter((s) => !s.is_current));
      setLoading(false);
      if (res.error) app.pushToasts([res.error]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll only — realtime on user_presence refires on every heartbeat and floods /ceo.
  useEffect(() => {
    if (!app.canSeeCeo) return;
    const boot = window.setTimeout(load, 2500);
    const t = window.setInterval(load, 120_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(t);
    };
  }, [app.canSeeCeo, load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!app.canSeeCeo) return null;

  const sessionCount = sessions.length;
  const peopleCount = new Set(sessions.map((s) => s.user_id).filter(Boolean)).size;

  const kickUser = async (s: SessionRow) => {
    setBusy(s.user_id);
    const res = await signOutUserEverywhere({ userId: s.user_id });
    setBusy("");
    if (res.error) app.pushToasts([res.error]);
    else app.pushToasts([`${s.name} signed out of ${res.revoked} device${res.revoked === 1 ? "" : "s"}.`]);
    load();
  };

  const kickAll = async () => {
    if (!confirm("Sign EVERYONE out of all devices? Your current session stays active.")) return;
    setBusy("__all__");
    const res = await signOutEveryone();
    setBusy("");
    if (res.error) app.pushToasts([res.error]);
    else app.pushToasts([`Signed out ${res.revoked} session${res.revoked === 1 ? "" : "s"} across all devices.`]);
    load();
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        title={`${peopleCount} people · ${sessionCount} sessions`}
        style={{
          border: `1px solid ${open ? C.blue : C.line}`,
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 700,
          color: open ? C.blueDeep : C.ink,
          background: open ? C.blueSoft : "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 7,
          boxShadow: "0 1px 2px rgba(18,21,26,0.04)",
        }}
      >
        <MonitorSmartphone size={15} />
        <span
          className="mono"
          style={{
            background: TONES.good.fg,
            color: "#fff",
            borderRadius: 20,
            padding: "0px 7px",
            fontSize: 11.5,
            fontWeight: 800,
          }}
        >
          {peopleCount}
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 10px)",
            right: 0,
            width: 560,
            maxWidth: "90vw",
            background: "#FFFFFF",
            borderRadius: 14,
            boxShadow: "0 18px 50px rgba(20,1,5,0.45)",
            border: `1px solid ${C.line}`,
            zIndex: 80,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${C.line}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>Active Logins</div>
              <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 1 }}>
                {peopleCount} people &middot; {sessionCount} session{sessionCount === 1 ? "" : "s"}{" "}
                &middot; device, IP and activity per login
              </div>
            </div>
            <button
              onClick={load}
              title="Refresh"
              style={{
                border: `1px solid ${C.line}`,
                background: C.surface,
                color: C.ink,
                borderRadius: 8,
                padding: 7,
                cursor: "pointer",
                display: "flex",
              }}
            >
              <RefreshCw size={13} className={loading ? "spin" : undefined} />
            </button>
          </div>

          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {sessions.length ? (
              sessions.map((s, i) => (
                <div
                  key={i}
                  style={{
                    padding: "11px 16px",
                    borderBottom: `1px solid ${C.lineSoft}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 1 }}>
                      {s.email} {s.title ? "\u00B7 " + s.title : ""}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 6,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: C.inkSoft,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          background: C.lineSoft,
                          borderRadius: 7,
                          padding: "2px 8px",
                        }}
                      >
                        <MonitorSmartphone size={12} /> {deviceOf(s.user_agent)}
                      </span>
                      <span className="mono" style={{ background: C.lineSoft, borderRadius: 7, padding: "2px 8px" }}>
                        IP {s.ip || "-"}
                      </span>
                      <span className="mono" style={{ background: C.lineSoft, borderRadius: 7, padding: "2px 8px" }}>
                        in: {fmtTs(s.signed_in_at)}
                      </span>
                      <span className="mono" style={{ background: C.lineSoft, borderRadius: 7, padding: "2px 8px" }}>
                        active {ago(s.last_seen)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => kickUser(s)}
                    disabled={busy !== ""}
                    title="Sign this person out of all their devices"
                    style={{
                      border: `1px solid ${TONES.bad.fg}`,
                      background: busy === s.user_id ? TONES.bad.fg : "#fff",
                      color: busy === s.user_id ? "#fff" : TONES.bad.fg,
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 11.5,
                      fontWeight: 800,
                      cursor: busy ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      flexShrink: 0,
                    }}
                  >
                    <LogOut size={12} /> {busy === s.user_id ? "Signing out\u2026" : "Sign out"}
                  </button>
                </div>
              ))
            ) : (
              <div style={{ padding: "18px 16px", fontSize: 12.5, color: C.inkFaint }}>
                {loading ? "Loading sessions\u2026" : "No one else is signed in right now."}
              </div>
            )}
          </div>

          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.line}`, background: C.surface }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/monitor");
              }}
              style={{
                width: "100%",
                border: `1px solid ${C.line}`,
                background: C.blueSoft,
                color: C.blueDeep,
                borderRadius: 9,
                padding: "8px 12px",
                fontSize: 12.5,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
                marginBottom: 8,
              }}
            >
              <Activity size={14} />
              Open Employee Monitor (login / away / logout)
            </button>
            <button
              onClick={kickAll}
              disabled={busy !== ""}
              style={{
                width: "100%",
                border: "none",
                background: TONES.bad.fg,
                color: "#fff",
                borderRadius: 9,
                padding: "9px 12px",
                fontSize: 12.5,
                fontWeight: 800,
                cursor: busy ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              <ShieldAlert size={14} />
              {busy === "__all__" ? "Signing everyone out\u2026" : "Sign everyone out of all devices"}
            </button>
            <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 6, textAlign: "center" }}>
              Your current session is never revoked. Signed-out devices are pushed to the login screen when their token expires (within ~1 hour).
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
