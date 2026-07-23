"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Download, RefreshCw, ShieldAlert, X } from "lucide-react";
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
  // Portal target only exists client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const downloadShot = useCallback(async (row: ScreenshotAlertRow) => {
    if (!row.preview_url) return;
    setDownloadingId(row.id);
    try {
      // Fetch as blob: the `download` attribute is ignored on cross-origin
      // signed URLs, so a plain <a download> would just open the image.
      const res = await fetch(row.preview_url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = (row.storage_path.split(".").pop() || "jpg").toLowerCase();
      const who = (row.actor_name || "employee").trim().replace(/\s+/g, "_");
      const stamp = new Date(row.created_at)
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `screenshot-${who}-${stamp}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(row.preview_url, "_blank", "noopener");
    } finally {
      setDownloadingId(null);
    }
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

  if (!open || !mounted) return null;

  // Portal to <body>: transformed ancestors (.crm-card:hover, .fade-up) would
  // otherwise become the containing block for position:fixed and pin the
  // modal to the top of the page instead of the viewport.
  return createPortal(
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
                    {r.preview_url ? (
                      // span (not button): the card itself is a button and
                      // nested buttons are invalid HTML.
                      <span
                        role="button"
                        tabIndex={0}
                        className="ss-dl-btn"
                        title="Download screenshot"
                        aria-label="Download screenshot"
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadShot(r);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            void downloadShot(r);
                          }
                        }}
                      >
                        {downloadingId === r.id ? (
                          <RefreshCw size={13} className="spin" />
                        ) : (
                          <Download size={13} />
                        )}
                      </span>
                    ) : null}
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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {preview.preview_url ? (
                  <button
                    type="button"
                    className="ss-panel-refresh"
                    onClick={() => void downloadShot(preview)}
                    disabled={downloadingId === preview.id}
                  >
                    {downloadingId === preview.id ? (
                      <RefreshCw size={14} className="spin" />
                    ) : (
                      <Download size={14} />
                    )}
                    Download
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ss-alert-x"
                  aria-label="Close"
                  onClick={() => setPreview(null)}
                >
                  <X size={16} />
                </button>
              </div>
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
    </>,
    document.body
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
