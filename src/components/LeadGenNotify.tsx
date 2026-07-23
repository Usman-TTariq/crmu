"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ShieldAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { CEO_ROLES } from "@/lib/constants";
import {
  fetchMyNotifications,
  markNotificationRead,
  type CrmNotification,
} from "@/actions/notifications";
import { getScreenshotAlertSignedUrl } from "@/actions/screenshot-alerts";
import { formatMonitorStamp } from "@/lib/monitor-tz";

type ToastItem = CrmNotification & { toastId: string };

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function kindLabel(kind: string): string {
  if (kind === "ops_disqualified") return "OPS";
  if (kind === "screenshot_alert") return "SS";
  return "QA";
}

function kindSource(kind: string): string {
  if (kind === "ops_disqualified") return "OPS QA";
  if (kind === "screenshot_alert") return "Security";
  return "Quality Assurance";
}

function showBrowserNotification(n: CrmNotification) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  try {
    const note = new Notification(n.title || "TGT Nexus", {
      body: n.body,
      tag: n.id,
      icon: "/brand/logo-mark-light.svg",
    });
    note.onclick = () => {
      window.focus();
      note.close();
    };
  } catch {
    /* ignore */
  }
}

export default function LeadGenNotify() {
  const app = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CrmNotification[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [ssAlert, setSsAlert] = useState<CrmNotification | null>(null);
  const [ssUrl, setSsUrl] = useState<string | null>(null);
  const [ssLoading, setSsLoading] = useState(false);
  const [ssError, setSsError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<string>());
  const myName = app.session.profile.full_name;
  const canNotify =
    app.role.key === "lg_agent" ||
    app.role.key === "lg_sup" ||
    app.role.key === "closer" ||
    CEO_ROLES.includes(app.role.key);

  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    const res = await fetchMyNotifications(40);
    if (res.error) return;
    setItems(res.rows);
    res.rows.forEach((r) => seenIds.current.add(r.id));
  }, []);

  const openScreenshotModal = useCallback(async (n: CrmNotification) => {
    setSsAlert(n);
    setSsUrl(null);
    setSsError(null);
    setSsLoading(true);
    const rawMeta = n.meta as unknown;
    const meta: Record<string, unknown> =
      rawMeta && typeof rawMeta === "object"
        ? (rawMeta as Record<string, unknown>)
        : typeof rawMeta === "string"
          ? (JSON.parse(rawMeta) as Record<string, unknown>)
          : {};
    const path = String(meta.storage_path || "");
    if (!path) {
      setSsError("No capture path on this alert. Was SQL 74 applied?");
      setSsLoading(false);
      return;
    }
    const res = await getScreenshotAlertSignedUrl(path);
    if (res.url) setSsUrl(res.url);
    else setSsError(res.error || "Could not load screenshot preview.");
    setSsLoading(false);
  }, []);

  useEffect(() => {
    if (!canNotify) return;
    void load();
  }, [canNotify, load]);

  useEffect(() => {
    if (!canNotify) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [canNotify]);

  useEffect(() => {
    if (!canNotify) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`crm-notifications-${myName}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "crm_notifications",
        },
        (payload) => {
          const row = payload.new as CrmNotification;
          if (!row?.id || row.recipient_name !== myName) return;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          const normalized: CrmNotification = {
            ...row,
            meta:
              row.meta && typeof row.meta === "object"
                ? (row.meta as Record<string, unknown>)
                : {},
          };
          setItems((prev) => [normalized, ...prev].slice(0, 40));
          const toastId = `${row.id}-${Date.now()}`;
          setToasts((prev) => [{ ...normalized, toastId }, ...prev].slice(0, 4));
          showBrowserNotification(normalized);
          if (normalized.kind === "screenshot_alert" && CEO_ROLES.includes(app.role.key)) {
            void openScreenshotModal(normalized);
            void markNotificationRead(normalized.id).then(() => {
              setItems((prev) =>
                prev.map((x) =>
                  x.id === normalized.id ? { ...x, read_at: new Date().toISOString() } : x
                )
              );
            });
          }
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
          }, 9000);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canNotify, myName, app.role.key, openScreenshotModal]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openNotification = async (n: CrmNotification) => {
    if (!n.read_at) {
      await markNotificationRead(n.id);
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      );
    }
    setOpen(false);
    setToasts((prev) => prev.filter((t) => t.id !== n.id));

    if (n.kind === "screenshot_alert") {
      void openScreenshotModal(n);
      return;
    }

    if (n.lead_id) {
      const tab = n.kind === "ops_disqualified" ? "closer" : "leadgen";
      app.jumpTo(tab, n.lead_id);
      router.push(`/${tab}`);
    }
  };

  const markAll = async () => {
    await markNotificationRead(null);
    setItems((prev) =>
      prev.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() }))
    );
  };

  const closeSsModal = () => {
    setSsAlert(null);
    setSsUrl(null);
    setSsError(null);
    setSsLoading(false);
  };

  if (!canNotify) return null;

  const actorName = String(ssAlert?.meta?.actor_name || "Employee");
  const pagePath = String(ssAlert?.meta?.page_path || "");
  const actorRole = String(ssAlert?.meta?.actor_role || "");

  return (
    <>
      <div className="lg-notify-wrap" ref={panelRef}>
        <button
          type="button"
          className="lg-notify-bell"
          aria-label={unread ? `${unread} unread notifications` : "Notifications"}
          title="Notifications"
          onClick={() => setOpen((v) => !v)}
        >
          <Bell size={16} />
          {unread > 0 ? (
            <span className="lg-notify-badge">{unread > 9 ? "9+" : unread}</span>
          ) : null}
        </button>

        {open ? (
          <div className="lg-notify-panel" role="dialog" aria-label="Notifications">
            <div className="lg-notify-panel-head">
              <span>Notifications</span>
              {unread > 0 ? (
                <button type="button" className="lg-notify-link" onClick={() => void markAll()}>
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="lg-notify-list">
              {items.length === 0 ? (
                <div className="lg-notify-empty">No notifications yet.</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`lg-notify-row${n.read_at ? "" : " is-unread"}`}
                    onClick={() => void openNotification(n)}
                  >
                    <div
                      className={`lg-notify-avatar${n.kind === "screenshot_alert" ? " is-ss" : ""}`}
                      aria-hidden
                    >
                      {kindLabel(n.kind)}
                    </div>
                    <div className="lg-notify-row-body">
                      <div className="lg-notify-row-title">{n.title}</div>
                      <div className="lg-notify-row-text">{n.body}</div>
                      <div className="lg-notify-row-meta">{relativeTime(n.created_at)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="lg-desktop-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.toastId} className="lg-desktop-toast" role="status">
            <div className="lg-desktop-toast-top">
              <span className="lg-desktop-toast-brand">TGT Nexus</span>
              <button
                type="button"
                className="lg-desktop-toast-x"
                aria-label="Dismiss"
                onClick={() => setToasts((prev) => prev.filter((x) => x.toastId !== t.toastId))}
              >
                <X size={14} />
              </button>
            </div>
            <button
              type="button"
              className="lg-desktop-toast-main"
              onClick={() => void openNotification(t)}
            >
              <div
                className={`lg-notify-avatar lg-notify-avatar-lg${t.kind === "screenshot_alert" ? " is-ss" : ""}`}
                aria-hidden
              >
                {kindLabel(t.kind)}
              </div>
              <div>
                <div className="lg-desktop-toast-source">{kindSource(t.kind)}</div>
                <div className="lg-desktop-toast-msg">
                  <strong>{t.title}</strong>
                  {t.body ? `: ${t.body}` : ""}
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {ssAlert ? (
        <div className="ss-alert-modal" role="dialog" aria-modal="true" aria-label="Screenshot alert">
          <div className="ss-alert-backdrop" onClick={closeSsModal} />
          <div className="ss-alert-card">
            <div className="ss-alert-head">
              <div className="ss-alert-head-left">
                <ShieldAlert size={18} />
                <span>Screenshot detected</span>
              </div>
              <button type="button" className="ss-alert-x" aria-label="Close" onClick={closeSsModal}>
                <X size={16} />
              </button>
            </div>
            <div className="ss-alert-meta">
              <div>
                <span className="ss-alert-label">Employee</span>
                <strong>
                  {actorName}
                  {actorRole ? ` (${actorRole})` : ""}
                </strong>
              </div>
              <div>
                <span className="ss-alert-label">Time</span>
                <strong>{formatMonitorStamp(ssAlert.created_at)}</strong>
              </div>
              {pagePath ? (
                <div>
                  <span className="ss-alert-label">Page</span>
                  <strong>{pagePath}</strong>
                </div>
              ) : null}
            </div>
            <div className="ss-alert-preview">
              {ssLoading ? (
                <div className="ss-alert-empty">Loading capture…</div>
              ) : ssUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ssUrl} alt={`Screenshot by ${actorName}`} />
              ) : (
                <div className="ss-alert-empty">{ssError || "Preview unavailable."}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
