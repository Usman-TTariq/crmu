"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Camera, RefreshCw, ShieldAlert, X } from "lucide-react";
import {
  listScreenshotAlerts,
  type ScreenshotAlertRow,
} from "@/actions/screenshot-alerts";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/components/app-context";
import { CEO_ROLES } from "@/lib/constants";
import { formatMonitorStamp } from "@/lib/monitor-tz";

export function ScreenshotGalleryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ScreenshotAlertRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ScreenshotAlertRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listScreenshotAlerts(100);
    if (res.error) setErr(res.error);
    else {
      setErr("");
      setRows(res.rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    const channel = supabase
      .channel("screenshot-alerts-gallery")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "screenshot_alerts" },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (preview) setPreview(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, preview, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="ss-gallery-modal" role="dialog" aria-modal="true" aria-label="All screenshots">
        <div className="ss-gallery-backdrop" onClick={onClose} />
        <div className="ss-gallery-shell">
          <div className="ss-gallery-head">
            <div className="ss-gallery-head-left">
              <Camera size={18} />
              <div>
                <div className="ss-gallery-title">All screenshots</div>
                <div className="ss-gallery-sub">
                  {loading ? "Loading…" : `${rows.length} capture${rows.length === 1 ? "" : "s"}`}
                </div>
              </div>
            </div>
            <div className="ss-gallery-head-actions">
              <button type="button" className="ss-panel-refresh" onClick={() => void load()}>
                <RefreshCw size={14} />
                Refresh
              </button>
              <button type="button" className="ss-alert-x" aria-label="Close" onClick={onClose}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="ss-gallery-body">
            {loading && rows.length === 0 ? (
              <div className="ss-gallery-empty">Loading captures…</div>
            ) : err ? (
              <div className="ss-gallery-empty ss-gallery-error">{err}</div>
            ) : rows.length === 0 ? (
              <div className="ss-gallery-empty">No screenshots yet.</div>
            ) : (
              <div className="ss-gallery-grid">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="ss-panel-card"
                    onClick={() => setPreview(r)}
                  >
                    <div className="ss-panel-thumb">
                      {r.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.preview_url} alt="" />
                      ) : (
                        <div className="ss-panel-thumb-empty">
                          <ShieldAlert size={18} />
                          No preview
                        </div>
                      )}
                    </div>
                    <div className="ss-panel-card-body">
                      <div className="ss-panel-name">{r.actor_name}</div>
                      <div className="ss-panel-meta">
                        {r.actor_role || "employee"}
                        {r.page_path ? ` · ${r.page_path}` : ""}
                      </div>
                      <div className="ss-panel-time">
                        {formatMonitorStamp(r.created_at)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {preview ? (
        <div className="ss-alert-modal" role="dialog" aria-modal="true">
          <div className="ss-alert-backdrop" onClick={() => setPreview(null)} />
          <div className="ss-alert-card">
            <div className="ss-alert-head">
              <div className="ss-alert-head-left">
                <ShieldAlert size={18} />
                <span>Screenshot</span>
              </div>
              <button
                type="button"
                className="ss-alert-x"
                aria-label="Close"
                onClick={() => setPreview(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="ss-alert-meta">
              <div>
                <span className="ss-alert-label">Employee</span>
                <strong>
                  {preview.actor_name}
                  {preview.actor_role ? ` (${preview.actor_role})` : ""}
                </strong>
              </div>
              <div>
                <span className="ss-alert-label">Time</span>
                <strong>{formatMonitorStamp(preview.created_at)}</strong>
              </div>
              {preview.page_path ? (
                <div>
                  <span className="ss-alert-label">Page</span>
                  <strong>{preview.page_path}</strong>
                </div>
              ) : null}
            </div>
            <div className="ss-alert-preview">
              {preview.preview_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.preview_url} alt={`Screenshot by ${preview.actor_name}`} />
              ) : (
                <div className="ss-alert-empty">Preview unavailable.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Header button for CEO / Super Admin — opens full screenshot gallery. */
export default function ScreenshotsButton() {
  const app = useApp();
  const [open, setOpen] = useState(false);

  if (!CEO_ROLES.includes(app.role.key)) return null;

  return (
    <>
      <button
        type="button"
        className="ss-header-btn"
        title="All screenshots"
        onClick={() => setOpen(true)}
      >
        <Camera size={15} />
        <span className="ss-header-btn-label">Screenshots</span>
      </button>
      <ScreenshotGalleryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
