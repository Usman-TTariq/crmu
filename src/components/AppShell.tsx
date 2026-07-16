"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, Lock, LogOut, Plus, Search } from "lucide-react";
import { C } from "@/lib/theme";
import { TIMEFRAMES, type Timeframe } from "@/lib/format";
import { TABS, NAV_GROUPS, groupOf, ADDABLE, USER_ADMIN_ROLES, type TabKey } from "@/lib/constants";
import { useApp } from "@/components/app-context";
import ActiveLogins from "@/components/ActiveLogins";
import PresenceBadge from "@/components/PresenceBadge";
import PresenceTracker from "@/components/PresenceTracker";
import { fetchTabCounts } from "@/actions/data";
import { signOut } from "@/actions/auth";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();

  const activeKey = (pathname.split("/")[1] || app.role.home) as TabKey;
  const tab = TABS.find((t) => t.k === activeKey) || TABS[0];

  const visibleTabs = TABS.filter(
    (t) =>
      app.viewTabs.includes(t.k) &&
      (t.k !== "ceo" || app.canSeeCeo) &&
      (t.k !== "monitor" || app.canSeeCeo)
  );

  const canEditTab = app.editTabs.includes(activeKey);
  const canAdd =
    !tab.kind &&
    canEditTab &&
    ADDABLE.includes(activeKey) &&
    (activeKey !== "teamsetup" || USER_ADMIN_ROLES.includes(app.role.key));

  useEffect(() => {
    let alive = true;
    fetchTabCounts({ tf: app.tf }).then((c) => {
      if (alive) app.setCounts(c);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.tf, pathname]);

  return (
    <div className="app-shell">
      <PresenceTracker />
      <div className="app-atmosphere" aria-hidden>
        <div className="app-atmosphere-wash" />
        <div className="app-atmosphere-grid" />
        <div className="app-atmosphere-glow" />
        <div className="app-atmosphere-noise" />
      </div>

      <nav className="app-side">
        <div className="app-side-brand app-rise">
          <div className="app-logo-lockup">
            <div className="app-logo-plate">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo-mark-light.svg" alt="" className="app-logo-mark" />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-type-light.svg" alt="TGT Nexus" className="app-logo-type" />
          </div>
          <div className="app-side-kicker">
            <span className="app-side-kicker-dot" aria-hidden />
            POS Operations
          </div>
        </div>

        <div className="side-scroll app-side-nav">
          {NAV_GROUPS.map((g, gi) => {
            const items = visibleTabs.filter((t) => g.keys.includes(t.k));
            if (!items.length) return null;
            return (
              <div
                key={g.label}
                className={`app-side-group app-rise app-rise-delay-${Math.min(gi + 1, 3)}`}
              >
                <div className="app-side-group-label">{g.label}</div>
                {items.map((t) => {
                  const at = t.k === activeKey;
                  const ro = !app.editTabs.includes(t.k) && !t.kind;
                  return (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => {
                        app.setQuery("");
                        router.push(`/${t.k}`);
                      }}
                      className={`crm-nav app-nav-btn${at ? " is-active" : ""}`}
                    >
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{t.emoji}</span>
                      <span style={{ fontSize: 13.5, fontWeight: at ? 700 : 600, flex: 1 }}>{t.label}</span>
                      {ro ? (
                        <Eye size={12} style={{ color: at ? C.ink : "rgba(255,255,255,0.7)", opacity: 0.85 }} />
                      ) : null}
                      {!t.kind ? (
                        <span className="mono app-nav-count">{app.counts[t.k] ?? "-"}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="app-side-foot">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#fff",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {app.session.profile.full_name}
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>{app.session.profile.title}</div>
          </div>
          <button type="button" onClick={() => signOut()} title="Sign out" className="app-side-logout">
            <LogOut size={14} />
          </button>
        </div>
      </nav>

      <main className="app-main">
        <header className="app-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="app-header-kicker">{groupOf(activeKey)}</div>
            <div className="app-header-title">
              <span style={{ fontSize: 18 }}>{tab.emoji}</span>
              {tab.label}
            </div>
          </div>
          <PresenceBadge />
          <ActiveLogins />
          <select
            value={app.tf}
            onChange={(e) => app.setTf(e.target.value as Timeframe)}
            className="app-control"
          >
            {TIMEFRAMES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {!tab.kind ? (
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 9, top: 9, color: C.inkFaint }} />
              <input
                value={app.query}
                onChange={(e) => app.setQuery(e.target.value)}
                placeholder="Search"
                className="app-control app-control-search"
              />
            </div>
          ) : null}
          {canAdd ? (
            <button type="button" onClick={() => app.requestAdd()} className="btnp app-cta">
              <Plus size={16} /> Add {tab.singular || "Row"}
            </button>
          ) : null}
        </header>

        <div className="app-scope">
          <Lock size={13} style={{ color: C.inkSoft }} />
          <span>
            <b>
              {app.session.profile.full_name} · {app.role.label}
            </b>{" "}
            · {app.role.scope}
            {!canEditTab && !tab.kind ? "  (this tab is read-only for you)" : ""}
          </span>
        </div>

        <section className="app-content">
          <div key={pathname} className="app-content-inner">
            {children}
          </div>
        </section>
      </main>

      <div style={{ position: "fixed", bottom: 18, right: 18, zIndex: 60, display: "flex", flexDirection: "column", gap: 8 }}>
        {app.toasts.map((t) => (
          <div
            key={t.id}
            className="crm-toast"
            style={{
              background: C.ink,
              color: "#fff",
              borderRadius: 10,
              padding: "11px 16px",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 10px 30px rgba(18,21,26,0.28)",
              maxWidth: 380,
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
