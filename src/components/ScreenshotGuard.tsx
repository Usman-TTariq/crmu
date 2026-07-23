"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useScreenshotDetection } from "camerashy/react";
import { domToBlob, domToJpeg } from "modern-screenshot";
import { useApp } from "@/components/app-context";
import { CEO_ROLES } from "@/lib/constants";
import { reportScreenshotAlert } from "@/actions/screenshot-alerts";

const CLIENT_COOLDOWN_MS = 15_000;

function isScreenshotChord(e: KeyboardEvent): boolean {
  if (e.code === "PrintScreen" || e.key === "PrintScreen") return true;
  // macOS screenshot chords
  if (e.metaKey && e.shiftKey && ["Digit3", "Digit4", "Digit5", "KeyS"].includes(e.code)) {
    return true;
  }
  // Windows Snipping Tool: Win+Shift+S (metaKey) or Ctrl+Shift+S
  if (e.shiftKey && e.code === "KeyS" && (e.metaKey || e.ctrlKey)) return true;
  return false;
}

async function captureRoot(root: HTMLElement): Promise<Blob | null> {
  const filter = (node: Node) => {
    if (!(node instanceof HTMLElement)) return true;
    return (
      !node.classList.contains("ss-watermark") &&
      !node.classList.contains("ss-alert-modal")
    );
  };
  try {
    const blob = await domToBlob(root, {
      type: "image/jpeg",
      quality: 0.7,
      scale: 0.5,
      filter,
    });
    if (blob && blob.size > 0) return blob;
  } catch {
    /* fall through */
  }
  try {
    const dataUrl = await domToJpeg(root, { quality: 0.7, scale: 0.5, filter });
    const res = await fetch(dataUrl);
    return await res.blob();
  } catch {
    return null;
  }
}

export default function ScreenshotGuard() {
  const app = useApp();
  const pathname = usePathname();
  const lastSent = useRef(0);
  const busy = useRef(false);
  const pathRef = useRef(pathname);
  const chordAt = useRef(0);
  pathRef.current = pathname;

  const exempt = CEO_ROLES.includes(app.role.key);

  const captureAndReport = useCallback(async () => {
    if (exempt || busy.current) return;
    const now = Date.now();
    if (now - lastSent.current < CLIENT_COOLDOWN_MS) return;
    busy.current = true;
    try {
      const root =
        (document.querySelector(".app-shell") as HTMLElement | null) ||
        document.body;
      const blob = await captureRoot(root);
      if (!blob || blob.size < 1) {
        console.warn("[screenshot-alert] empty capture blob");
        return;
      }

      const fd = new FormData();
      fd.append("image", blob, "capture.jpg");
      fd.append("page_path", pathRef.current || "/");
      const res = await reportScreenshotAlert(fd);
      if (res.ok) {
        lastSent.current = Date.now();
        console.info("[screenshot-alert] reported ok");
      } else {
        console.warn("[screenshot-alert]", res.error);
      }
    } catch (err) {
      console.warn("[screenshot-alert] capture failed", err);
    } finally {
      busy.current = false;
    }
  }, [exempt]);

  // camerashy (PrintScreen / macOS / some Win chords)
  useScreenshotDetection({
    sensitivity: "paranoid",
    onDetection: () => {
      void captureAndReport();
    },
  });

  // Extra native listeners — Win+Shift+S often never delivers KeyS to the page;
  // capture on chord OR on blur shortly after Shift/Meta/Win.
  useEffect(() => {
    if (exempt) return;

    const markChord = (e: KeyboardEvent) => {
      if (
        e.metaKey ||
        e.shiftKey ||
        e.ctrlKey ||
        e.code === "PrintScreen" ||
        e.key === "PrintScreen" ||
        e.key === "Meta"
      ) {
        chordAt.current = Date.now();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      markChord(e);
      if (isScreenshotChord(e)) void captureAndReport();
    };

    // Some Windows builds only expose PrintScreen on keyup
    const onKeyUp = (e: KeyboardEvent) => {
      markChord(e);
      if (e.code === "PrintScreen" || e.key === "PrintScreen") {
        void captureAndReport();
      }
    };

    const onBlur = () => {
      if (Date.now() - chordAt.current < 1200) void captureAndReport();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden" && Date.now() - chordAt.current < 1200) {
        void captureAndReport();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [exempt, captureAndReport]);

  if (exempt) return null;

  const shortId = app.session.userId.slice(0, 8);
  const label = `${app.session.profile.full_name} · ${app.role.key} · ${shortId}`;

  return (
    <div className="ss-watermark" aria-hidden>
      <div className="ss-watermark-layer">
        {Array.from({ length: 36 }, (_, i) => (
          <span key={i} className="ss-watermark-tile">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
