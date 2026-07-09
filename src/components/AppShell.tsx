"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye, Lock, LogOut, Plus, Search } from "lucide-react";
import { C } from "@/lib/theme";
import { TIMEFRAMES, type Timeframe } from "@/lib/format";
import { TABS, NAV_GROUPS, groupOf, ADDABLE, USER_ADMIN_ROLES, type TabKey } from "@/lib/constants";
import { useApp } from "@/components/app-context";
import { fetchTabCounts } from "@/actions/data";
import { signOut } from "@/actions/auth";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();

  const activeKey = (pathname.split("/")[1] || app.role.home) as TabKey;
  const tab = TABS.find((t) => t.k === activeKey) || TABS[0];

  const visibleTabs = TABS.filter(
    (t) => app.viewTabs.includes(t.k) && (t.k !== "ceo" || app.canSeeCeo)
  );

  const canEditTab = app.editTabs.includes(activeKey);
  const canAdd =
    !tab.kind &&
    canEditTab &&
    ADDABLE.includes(activeKey) &&
    // roster changes are admin-only (matches the profiles RLS policies)
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
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundImage: "linear-gradient(160deg, #4A060F 0%, #7E0E1F 48%, #B01226 100%)",
        color: C.ink,
      }}
    >
      <nav
        style={{
          width: 238,
          position: "sticky",
          top: 0,
          height: "100vh",
          alignSelf: "flex-start",
          backgroundImage: "linear-gradient(180deg, #3F050D 0%, #6E0B1B 100%)",
          color: "rgba(255,255,255,0.9)",
          borderRight: "1px solid rgba(255,255,255,0.10)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "18px 18px 16px" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: "14px 12px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 19, fontWeight: 800, color: C.blueDeep, letterSpacing: "0.02em" }}>
              TGT NEXUS
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#FFFFFF",
              opacity: 0.78,
              fontWeight: 700,
              marginTop: 10,
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              textAlign: "center",
            }}
          >
            POS Operations
          </div>
        </div>
        <div className="side-scroll" style={{ padding: "4px 12px", overflowY: "auto", flex: 1 }}>
          {NAV_GROUPS.map((g) => {
            const items = visibleTabs.filter((t) => g.keys.includes(t.k));
            if (!items.length) return null;
            return (
              <div key={g.label} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    opacity: 0.6,
                    textTransform: "uppercase",
                    letterSpacing: "0.14em",
                    padding: "8px 12px 5px",
                  }}
                >
                  {g.label}
                </div>
                {items.map((t) => {
                  const at = t.k === activeKey;
                  const ro = !app.editTabs.includes(t.k) && !t.kind;
                  return (
                    <button
                      key={t.k}
                      onClick={() => {
                        app.setQuery("");
                        router.push(`/${t.k}`);
                      }}
                      className="crm-nav"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        border: "none",
                        textAlign: "left",
                        background: at ? "#FFFFFF" : "transparent",
                        color: at ? C.ink : "rgba(255,255,255,0.88)",
                        borderRadius: 9,
                        padding: "8px 12px",
                        fontSize: 13.5,
                        cursor: "pointer",
                        marginBottom: 2,
                        boxShadow: at ? "0 4px 14px rgba(0,0,0,0.28)" : "none",
                      }}
                    >
                      <span style={{ fontSize: 15, flexShrink: 0 }}>{t.emoji}</span>
                      <span style={{ fontSize: 13.5, fontWeight: at ? 800 : 600, flex: 1 }}>{t.label}</span>
                      {ro ? (
                        <Eye size={12} style={{ color: at ? C.ink : "rgba(255,255,255,0.8)", opacity: 0.85 }} />
                      ) : null}
                      {!t.kind ? (
                        <span
                          className="mono"
                          style={{
                            fontSize: 11,
                            background: at ? C.blue : "rgba(255,255,255,0.18)",
                            color: "#fff",
                            borderRadius: 20,
                            padding: "1px 7px",
                            fontWeight: 700,
                          }}
                        >
                          {app.counts[t.k] ?? "-"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div
          style={{
            padding: "14px 18px",
            borderTop: "1px solid rgba(255,255,255,0.14)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {app.session.profile.full_name}
            </div>
            <div style={{ fontSize: 10.5, color: "#FFFFFF", opacity: 0.65 }}>{app.session.profile.title}</div>
          </div>
          <button
            onClick={() => signOut()}
            title="Sign out"
            style={{
              border: "none",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              borderRadius: 8,
              padding: 7,
              cursor: "pointer",
              display: "flex",
            }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: 64,
            position: "sticky",
            top: 0,
            zIndex: 30,
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.15)",
            backgroundImage: "linear-gradient(90deg, #5C0813 0%, #8C0F22 100%)",
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "0 20px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "rgba(255,255,255,0.65)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {groupOf(activeKey)}
            </div>
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 1,
              }}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </div>
          </div>
          <select
            value={app.tf}
            onChange={(e) => app.setTf(e.target.value as Timeframe)}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 13,
              fontWeight: 600,
              color: C.ink,
              background: "#FFFFFF",
              boxShadow: "0 3px 10px rgba(0,0,0,0.22)",
              outline: "none",
            }}
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
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 10px 8px 30px",
                  fontSize: 13,
                  width: 150,
                  color: C.ink,
                  background: "#FFFFFF",
                  outline: "none",
                  boxShadow: "0 3px 10px rgba(0,0,0,0.22)",
                }}
              />
            </div>
          ) : null}
          {canAdd ? (
            <button
              onClick={() => app.requestAdd()}
              className="btnp"
              style={{
                border: "none",
                background: "#FFFFFF",
                color: C.blue,
                borderRadius: 10,
                padding: "9px 15px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 5px 16px rgba(0,0,0,0.28)",
              }}
            >
              <Plus size={16} /> Add {tab.singular || "Row"}
            </button>
          ) : null}
        </header>

        <div
          style={{
            flexShrink: 0,
            position: "sticky",
            top: 64,
            zIndex: 29,
            background: "#5E0A16",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            padding: "8px 20px",
            display: "flex",
            alignItems: "center",
            gap: 9,
          }}
        >
          <Lock size={13} style={{ color: "rgba(255,255,255,0.85)" }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
            <b style={{ fontWeight: 700 }}>
              {app.session.profile.full_name} · {app.role.label}
            </b>{" "}
            · {app.role.scope}
            {!canEditTab && !tab.kind ? "  (this tab is read-only for you)" : ""}
          </span>
        </div>

        <section style={{ flex: 1, minWidth: 0 }}>{children}</section>
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
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
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
