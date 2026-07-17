"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { C } from "@/lib/theme";
import { stamp } from "@/lib/format";
import { USER_ADMIN_ROLES } from "@/lib/constants";
import { useApp } from "@/components/app-context";
import TablePager from "@/components/TablePager";
import { fetchActivityLogs, type ActivityLogRow } from "@/actions/logs";

const ROW_PX = 42;
const HEAD_PX = 40;
const PAGER_PX = 56;
const MIN = 8;
const MAX = 80;

const ACTION_LABELS: Record<string, string> = {
  "record.create": "Create",
  "record.update": "Update",
  "record.delete": "Delete",
  "comment.add": "Comment",
  "file.upload": "Upload",
  "file.delete": "File delete",
  "admin.create_login": "Create login",
  "admin.set_password": "Set password",
  "admin.deactivate": "Deactivate",
  "admin.reactivate": "Reactivate",
  "admin.revoke_login": "Revoke login",
  "admin.view_as": "View as",
  "admin.view_as_exit": "Exit view as",
  "auth.sign_in": "Sign in",
  "auth.sign_out": "Sign out",
};

export default function LogsPage() {
  const app = useApp();
  const allowed = USER_ADMIN_ROLES.includes(app.role.key);

  const [rows, setRows] = useState<ActivityLogRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);

  const pageSizeReady = pageSize > 0;
  const loading = rows === null || !pageSizeReady;

  useEffect(() => {
    if (!allowed) return;
    const el = shellRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const available = Math.max(0, window.innerHeight - top - 20);
      const next = Math.max(MIN, Math.min(MAX, Math.floor((available - HEAD_PX - PAGER_PX) / ROW_PX) || MIN));
      setPageSize((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [allowed]);

  useEffect(() => {
    setPage(1);
  }, [app.tf, app.query, actionFilter]);

  useEffect(() => {
    if (!allowed || !pageSizeReady) return;
    let alive = true;
    fetchActivityLogs({
      page,
      pageSize,
      q: app.query.trim() || undefined,
      tf: app.tf,
      action: actionFilter || undefined,
    }).then((res) => {
      if (!alive) return;
      if (res.error) app.pushToasts([res.error]);
      setRows(res.rows);
      setTotal(res.total);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, pageSizeReady, page, pageSize, app.query, app.tf, actionFilter]);

  if (!allowed) {
    return <div className="app-gate">Activity Logs are only visible to CEO and Super Admin.</div>;
  }

  return (
    <div className="app-page">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Activity Logs</div>
          <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>
            Every account action (creates, edits, logins, admin). Use header timeframe and search to filter.
          </div>
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            background: C.surface,
            color: C.ink,
            minWidth: 180,
          }}
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={shellRef}
        style={{
          background: C.surface,
          border: `1px solid ${C.line}`,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 12px 34px rgba(46,4,10,0.30)",
          display: "flex",
          flexDirection: "column",
          minHeight: pageSizeReady ? HEAD_PX + pageSize * ROW_PX + PAGER_PX : 240,
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              padding: "72px 24px",
              flex: 1,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "linear-gradient(180deg,#f8ecec,#fff)",
                border: `1px solid ${C.line}`,
                display: "grid",
                placeItems: "center",
                boxShadow: "0 8px 20px rgba(46,4,10,0.08)",
              }}
            >
              <Loader2 size={22} className="spin" style={{ color: C.blue }} />
            </div>
            <div style={{ fontWeight: 700, color: C.ink, fontSize: 14 }}>Loading activity logs…</div>
            <div style={{ fontSize: 12.5, color: C.inkFaint }}>Fetching audit trail</div>
          </div>
        ) : (
          <>
            <div className="data-table-scroll overflow-auto" style={{ flex: 1, minHeight: 0 }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", fontSize: 13.5 }}>
                <thead>
                  <tr>
                    {["Time", "Actor", "Role", "Action", "Entity", "Summary"].map((h) => (
                      <th
                        key={h}
                        style={{
                          position: "sticky",
                          top: 0,
                          zIndex: 1,
                          background: C.lineSoft,
                          color: C.inkSoft,
                          textAlign: "left",
                          padding: "9px 14px",
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                          borderBottom: `1px solid ${C.line}`,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "48px 14px", textAlign: "center", color: C.inkSoft }}>
                        No log entries for this filter.
                      </td>
                    </tr>
                  ) : (
                    (rows || []).map((r, i) => (
                      <tr key={r.id} style={{ background: i % 2 ? C.bg : C.surface }}>
                        <td className="mono" style={{ padding: "9px 14px", whiteSpace: "nowrap", borderBottom: `1px solid ${C.lineSoft}` }}>
                          {stamp(r.created_at)}
                        </td>
                        <td style={{ padding: "9px 14px", whiteSpace: "nowrap", borderBottom: `1px solid ${C.lineSoft}`, fontWeight: 600 }}>
                          {r.actor_name || "—"}
                        </td>
                        <td style={{ padding: "9px 14px", whiteSpace: "nowrap", borderBottom: `1px solid ${C.lineSoft}`, color: C.inkSoft }}>
                          {r.actor_role || "—"}
                        </td>
                        <td style={{ padding: "9px 14px", whiteSpace: "nowrap", borderBottom: `1px solid ${C.lineSoft}` }}>
                          {ACTION_LABELS[r.action] || r.action}
                        </td>
                        <td className="mono" style={{ padding: "9px 14px", whiteSpace: "nowrap", borderBottom: `1px solid ${C.lineSoft}`, color: C.inkSoft }}>
                          {[r.entity_tab, r.entity_id].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td style={{ padding: "9px 14px", borderBottom: `1px solid ${C.lineSoft}`, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.summary}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePager page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
