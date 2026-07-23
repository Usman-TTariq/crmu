"use client";

import React, { startTransition, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Lock, LogOut, Menu, Plus, Search, X } from "lucide-react";
import { C } from "@/lib/theme";
import { TIMEFRAMES, isDayTimeframe, type Timeframe } from "@/lib/format";
import { TABS, NAV_GROUPS, groupOf, ADDABLE, USER_ADMIN_ROLES, CEO_ROLES, type TabKey } from "@/lib/constants";
import { useApp } from "@/components/app-context";
import ActiveLogins from "@/components/ActiveLogins";
import PresenceBadge from "@/components/PresenceBadge";
import PresenceTracker from "@/components/PresenceTracker";
import BreakControl from "@/components/BreakControl";
import LeadGenNotify from "@/components/LeadGenNotify";
import ScreenshotsButton from "@/components/ScreenshotGallery";
import ScreenshotGuard from "@/components/ScreenshotGuard";
import { logSignIn, signOut } from "@/actions/auth";
import { stopViewAs } from "@/actions/impersonate";
import { PIPELINE_PAGE_SIZE, pipelineRowsKey, tabCountsKey } from "@/lib/query-keys";
import {
  defaultPipelinePrefetchPayload,
  queryPipelineRows,
  queryTabCounts,
} from "@/lib/pipeline-queries";

const SIGN_IN_LOG_KEY = "crm_signed_in_logged";

function pathTabKey(pathname: string, home: TabKey): TabKey {
  return (pathname.split("/")[1] || home) as TabKey;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [navOpen, setNavOpen] = useState(false);
  /** Instant highlight / header before Next finishes the route fetch. */
  const [pendingKey, setPendingKey] = useState<TabKey | null>(null);

  const pathKey = pathTabKey(pathname, app.role.home);
  const activeKey = pendingKey || pathKey;
  const tab = TABS.find((t) => t.k === activeKey) || TABS[0];
  const navigating = pendingKey !== null && pendingKey !== pathKey;

  const JOURNEY_PEEK_NAV_HIDE = new Set<TabKey>(["leadgen", "closer", "documentation"]);
  const visibleTabs = TABS.filter((t) => {
    if (!app.viewTabs.includes(t.k)) return false;
    if (t.k === "ceo" && !app.canSeeCeo) return false;
    if (t.k === "monitor" && !app.canSeeMonitor) return false;
    if (t.k === "counselling" && !app.canSeeCounselling) return false;
    if (t.k === "logs" && !USER_ADMIN_ROLES.includes(app.role.key)) return false;
    // OPS roles: Lead / Closer / Docs are journey peek-only (not left-nav pipeline pages)
    if (
      app.role.home === "ops" &&
      JOURNEY_PEEK_NAV_HIDE.has(t.k) &&
      !app.editTabs.includes(t.k)
    ) {
      return false;
    }
    return true;
  });

  const pipelineNavTabs = visibleTabs.filter((t) => !t.kind).map((t) => t.k);

  const countsQuery = useQuery({
    queryKey: tabCountsKey(app.tf, app.viewTabs),
    queryFn: () => queryTabCounts(app.tf, app.viewTabs),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (countsQuery.data) app.setCounts(countsQuery.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync query → context badges
  }, [countsQuery.data]);

  const prefetchTabData = (key: TabKey) => {
    if (!pipelineNavTabs.includes(key)) return;
    const payload = defaultPipelinePrefetchPayload(key, app.tf);
    void queryClient.prefetchQuery({
      queryKey: pipelineRowsKey({
        tab: key,
        tf: app.tf,
        page: 1,
        pageSize: PIPELINE_PAGE_SIZE,
        q: "",
        filtersKey: "",
      }),
      queryFn: () => queryPipelineRows(payload),
    });
  };

  const canEditTab = app.editTabs.includes(activeKey);
  const canAdd =
    !tab.kind &&
    canEditTab &&
    ADDABLE.includes(activeKey) &&
    (activeKey !== "teamsetup" || USER_ADMIN_ROLES.includes(app.role.key)) &&
    (activeKey !== "ops" || CEO_ROLES.includes(app.role.key));

  const goTab = (key: TabKey) => {
    if (key === "counselling" && app.counsellingLocked) {
      app.pushToasts(["Performance Overview is locked for everyone right now."]);
      setNavOpen(false);
      return;
    }
    if (key === pathKey && !pendingKey) {
      setNavOpen(false);
      return;
    }
    app.setQuery("");
    setNavOpen(false);
    setPendingKey(key);
    router.prefetch(`/${key}`);
    prefetchTabData(key);
    startTransition(() => {
      router.push(`/${key}`);
    });
  };

  useEffect(() => {
    setPendingKey(null);
    setNavOpen(false);
  }, [pathname]);

  // Audit log once per browser session — never blocks login.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SIGN_IN_LOG_KEY)) return;
      sessionStorage.setItem(SIGN_IN_LOG_KEY, "1");
    } catch {
      // private mode / blocked storage — still try to log once this mount
    }
    void logSignIn();
  }, []);

  const viewTabsKey = app.viewTabs.join(",");

  // Remember role home so the next login can skip the / → home bounce.
  useEffect(() => {
    try {
      localStorage.setItem("crm_home", `/${app.role.home}`);
    } catch {
      /* ignore */
    }
  }, [app.role.home]);

  // If URL is a tab this role cannot open (e.g. /ceo after shared-browser login), bounce home.
  useEffect(() => {
    const key = pathTabKey(pathname, app.role.home);
    const allowed = visibleTabs.some((t) => t.k === key);
    if (!allowed && key !== app.role.home) {
      router.replace(`/${app.role.home}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, app.role.home, viewTabsKey]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  // Warm route chunks so the next click doesn't wait on first compile/fetch.
  useEffect(() => {
    for (const t of visibleTabs) {
      router.prefetch(`/${t.k}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTabsKey]);

  return (
    <div className={`app-shell min-w-0 w-full${navOpen ? " nav-open" : ""}${navigating ? " is-navigating" : ""}`}>
      {navigating ? <div className="app-nav-progress" aria-hidden /> : null}
      <PresenceTracker />
      <div className="app-atmosphere" aria-hidden>
        <div className="app-atmosphere-wash" />
        <div className="app-atmosphere-grid" />
        <div className="app-atmosphere-glow" />
        <div className="app-atmosphere-noise" />
      </div>

      {navOpen ? (
        <button
          type="button"
          className="app-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <nav className={`app-side${navOpen ? " is-open" : ""}`} aria-label="Main">
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
                  const locked = t.k === "counselling" && app.counsellingLocked;
                  return (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => goTab(t.k)}
                      onMouseEnter={() => {
                        if (locked) return;
                        router.prefetch(`/${t.k}`);
                        prefetchTabData(t.k);
                      }}
                      title={locked ? "Locked for everyone" : undefined}
                      className={`crm-nav app-nav-btn${at ? " is-active" : ""}${locked ? " is-locked" : ""}`}
                      style={locked ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                    >
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{t.emoji}</span>
                      <span style={{ fontSize: 13.5, fontWeight: at ? 700 : 600, flex: 1 }}>{t.label}</span>
                      {locked ? (
                        <Lock size={12} style={{ color: "rgba(255,255,255,0.75)", flexShrink: 0 }} />
                      ) : ro ? (
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
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(SIGN_IN_LOG_KEY);
              } catch {
                /* ignore */
              }
              void signOut();
            }}
            title="Sign out"
            className="app-side-logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </nav>

      <main className="app-main">
        {app.viewAsName ? (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              padding: "10px 16px",
              background: "linear-gradient(90deg,#7a1f12,#5c160e)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              borderBottom: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span>
              Viewing as <strong style={{ fontWeight: 800 }}>{app.viewAsName}</strong>
              <span style={{ fontWeight: 500, opacity: 0.85 }}>
                {" "}
                — you see their dashboard and data. Changes save as them.
              </span>
            </span>
            <button
              type="button"
              onClick={async () => {
                const res = await stopViewAs();
                if (res?.error) app.pushToasts([res.error]);
              }}
              style={{
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Exit view as
            </button>
          </div>
        ) : null}
        <header className="app-header">
          <button
            type="button"
            className="app-menu-btn"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="app-header-title-block">
            <div className="app-header-kicker">{groupOf(activeKey)}</div>
            <div className="app-header-title">
              <span className="app-header-emoji">{tab.emoji}</span>
              {tab.label}
            </div>
          </div>
          <div className="app-header-actions">
            <ScreenshotsButton />
            <LeadGenNotify />
            <BreakControl />
            <PresenceBadge />
            <ActiveLogins />
            {app.role.key === "hr" || app.role.key === "hr_monitor" ? null : (
              <>
                <select
                  value={isDayTimeframe(app.tf) ? "__day__" : app.tf}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__day__") return;
                    app.setTf(v as Timeframe);
                  }}
                  className="app-control"
                  title="Timeframe"
                >
                  {TIMEFRAMES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  {isDayTimeframe(app.tf) ? (
                    <option value="__day__">{app.tf}</option>
                  ) : null}
                </select>
                <input
                  type="date"
                  value={isDayTimeframe(app.tf) ? app.tf : ""}
                  onChange={(e) => {
                    const d = e.target.value;
                    app.setTf(d || "All time");
                  }}
                  className="app-control"
                  title="Pick a date — show that day's records"
                  aria-label="Pick a date"
                  style={{ minWidth: 140 }}
                />
              </>
            )}
            {!tab.kind ? (
              <div className="app-search-wrap">
                <Search size={15} className="app-search-icon" />
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
                <Plus size={16} />
                <span className="app-cta-label">Add {tab.singular || "Row"}</span>
              </button>
            ) : null}
          </div>
        </header>

        <div className="app-scope">
          <Lock size={13} style={{ color: C.inkSoft, flexShrink: 0 }} />
          <span className="app-scope-text">
            <b>
              {app.session.profile.full_name} · {app.role.label}
            </b>
            <span className="app-scope-detail">
              {" "}
              · {app.role.scope}
              {!canEditTab && !tab.kind ? "  (this tab is read-only for you)" : ""}
            </span>
          </span>
        </div>

        <section
          className="app-content"
          style={navigating ? { opacity: 0.72, transition: "opacity 120ms ease" } : undefined}
        >
          <div className="app-content-inner">{children}</div>
        </section>
      </main>

      <div className="app-toasts">
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

      <ScreenshotGuard />
    </div>
  );
}
