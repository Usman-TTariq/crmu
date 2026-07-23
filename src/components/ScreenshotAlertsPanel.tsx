"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Camera, RefreshCw, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/dash";
import { C } from "@/lib/theme";
import {
  listScreenshotAlerts,
  type ScreenshotAlertRow,
} from "@/actions/screenshot-alerts";
import { createClient } from "@/lib/supabase/client";
import { ScreenshotGalleryModal } from "@/components/ScreenshotGallery";
import { formatMonitorStamp } from "@/lib/monitor-tz";

export default function ScreenshotAlertsPanel() {
  const [rows, setRows] = useState<ScreenshotAlertRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [galleryOpen, setGalleryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listScreenshotAlerts(6);
    if (res.error) setErr(res.error);
    else {
      setErr("");
      setRows(res.rows);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("screenshot-alerts-ceo")
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
  }, [load]);

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Panel
          title="Screenshot security alerts"
          color="#7c2d12"
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="ss-panel-refresh"
                onClick={() => void load()}
                title="Refresh"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
              <button
                type="button"
                className="ss-view-all-btn"
                onClick={() => setGalleryOpen(true)}
              >
                <Camera size={14} />
                View all screenshots
              </button>
            </div>
          }
        >
          <div style={{ fontSize: 12.5, color: C.inkSoft, marginBottom: 12 }}>
            Latest captures. Open <b>View all screenshots</b> (or the header{" "}
            <b>Screenshots</b> button) for the full gallery.
          </div>

          {loading ? (
            <div style={{ fontSize: 13, color: C.inkFaint }}>Loading alerts…</div>
          ) : err ? (
            <div style={{ fontSize: 13, color: "#b45309" }}>
              {err}
              {err.toLowerCase().includes("does not exist") ||
              err.toLowerCase().includes("schema cache") ||
              err.toLowerCase().includes("could not find")
                ? " — run sql/74_screenshot_alerts.sql in Supabase SQL Editor."
                : ""}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkFaint }}>
              No screenshot alerts yet.
            </div>
          ) : (
            <div className="ss-panel-grid">
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="ss-panel-card"
                  onClick={() => setGalleryOpen(true)}
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
        </Panel>
      </div>

      <ScreenshotGalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} />
    </>
  );
}
