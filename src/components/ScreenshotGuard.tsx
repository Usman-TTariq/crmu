"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useScreenshotDetection } from "camerashy/react";
import { domToBlob, domToJpeg } from "modern-screenshot";
import { useApp } from "@/components/app-context";
import { CEO_ROLES } from "@/lib/constants";
import { reportScreenshotAlert } from "@/actions/screenshot-alerts";

const CLIENT_COOLDOWN_MS = 15_000;
/** How long after detection we keep polling the clipboard for the real snip. */
const CLIP_WATCH_MS = 10_000;
const CLIP_POLL_MS = 700;
/** Server rejects > 5MB; re-encode anything bigger or wider than this. */
const MAX_UPLOAD_BYTES = 4_500_000;
const MAX_UPLOAD_WIDTH = 1920;

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

/** Read an image from the clipboard (the actual OS screenshot / snip). */
async function readClipboardImage(): Promise<Blob | null> {
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") return null;
    // Chromium throws NotAllowedError when the document is unfocused.
    if (!document.hasFocus()) return null;
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        const blob = await item.getType(type);
        if (blob && blob.size > 0) return blob;
      }
    }
  } catch {
    /* permission denied / no image / unfocused */
  }
  return null;
}

/** Cheap identity for a clipboard image: size + digest of the first 4KB. */
async function hashBlob(blob: Blob): Promise<string> {
  try {
    const head = await blob.slice(0, 4096).arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", head);
    const bytes = Array.from(new Uint8Array(digest).slice(0, 12));
    return `${blob.size}:${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return `${blob.size}:${blob.type}`;
  }
}

/** Downscale / re-encode to JPEG so 4K PNG snips stay under the 5MB limit. */
async function normalizeImage(blob: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_UPLOAD_WIDTH / bmp.width);
    if (scale === 1 && blob.type === "image/jpeg" && blob.size <= MAX_UPLOAD_BYTES) {
      bmp.close();
      return blob;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return blob;
    }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8)
    );
    return out && out.size > 0 ? out : blob;
  } catch {
    return blob;
  }
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

interface ClipWatch {
  until: number;
  /** Hash of whatever image was in the clipboard before the snip (if readable). */
  baseline: string | null;
  /** PrintScreen: the fresh screenshot is already in the clipboard — accept it. */
  immediate: boolean;
  done: boolean;
  timer: ReturnType<typeof setInterval> | null;
  fallback: ReturnType<typeof setTimeout> | null;
}

export default function ScreenshotGuard() {
  const app = useApp();
  const pathname = usePathname();
  const lastSent = useRef(0);
  const busy = useRef(false);
  const pathRef = useRef(pathname);
  const chordAt = useRef(0);
  const watch = useRef<ClipWatch | null>(null);
  const lastUploadedHash = useRef("");
  pathRef.current = pathname;

  const exempt = CEO_ROLES.includes(app.role.key);

  const send = useCallback(async (blob: Blob, name: string): Promise<boolean> => {
    const fd = new FormData();
    fd.append("image", blob, name);
    fd.append("page_path", pathRef.current || "/");
    const res = await reportScreenshotAlert(fd);
    if (res.ok) {
      lastSent.current = Date.now();
      console.info("[screenshot-alert] reported ok");
      return true;
    }
    console.warn("[screenshot-alert]", res.error);
    return false;
  }, []);

  /** Fallback: render the CRM page itself (old behavior). */
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
      await send(blob, "capture.jpg");
    } catch (err) {
      console.warn("[screenshot-alert] capture failed", err);
    } finally {
      busy.current = false;
    }
  }, [exempt, send]);

  const stopWatch = useCallback(() => {
    const w = watch.current;
    if (!w) return;
    w.done = true;
    if (w.timer) clearInterval(w.timer);
    if (w.fallback) clearTimeout(w.fallback);
    watch.current = null;
  }, []);

  /** One clipboard attempt: upload the real snip if a fresh image is there. */
  const tryClipboard = useCallback(async () => {
    const w = watch.current;
    if (!w || w.done || Date.now() > w.until) return;
    const blob = await readClipboardImage();
    if (!blob) return;
    const hash = await hashBlob(blob);
    // Skip whatever was in the clipboard before the snip, and re-detections
    // of an image we already uploaded.
    if (!w.immediate && w.baseline && hash === w.baseline) return;
    if (hash === lastUploadedHash.current) return;
    w.done = true;
    stopWatch();
    try {
      const normalized = await normalizeImage(blob);
      const ok = await send(normalized, "capture.jpg");
      if (ok) lastUploadedHash.current = hash;
    } catch (err) {
      console.warn("[screenshot-alert] clipboard upload failed", err);
      void captureAndReport();
    }
  }, [send, stopWatch, captureAndReport]);

  /**
   * Detection entry: watch the clipboard for the user's actual capture
   * (exact snipped region); fall back to the DOM render after the window.
   */
  const onDetect = useCallback(
    (immediate: boolean) => {
      if (exempt) return;
      if (Date.now() - lastSent.current < CLIENT_COOLDOWN_MS) return;
      if (watch.current && !watch.current.done) return; // one watch at a time
      const w: ClipWatch = {
        until: Date.now() + CLIP_WATCH_MS,
        baseline: null,
        immediate,
        done: false,
        timer: null,
        fallback: null,
      };
      watch.current = w;
      void (async () => {
        if (!immediate) {
          // Snip flow: remember the pre-snip clipboard image so we never
          // upload stale (possibly personal) clipboard content.
          const prior = await readClipboardImage();
          if (prior) w.baseline = await hashBlob(prior);
        }
        await tryClipboard();
      })();
      w.timer = setInterval(() => void tryClipboard(), CLIP_POLL_MS);
      w.fallback = setTimeout(() => {
        if (!w.done) {
          stopWatch();
          void captureAndReport();
        }
      }, CLIP_WATCH_MS);
    },
    [exempt, tryClipboard, stopWatch, captureAndReport]
  );

  // Snip finishes while the window is unfocused; grab it the moment focus returns.
  useEffect(() => {
    if (exempt) return;
    const onFocus = () => void tryClipboard();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [exempt, tryClipboard]);

  useEffect(() => stopWatch, [stopWatch]);

  // camerashy (PrintScreen / macOS / some Win chords)
  useScreenshotDetection({
    sensitivity: "paranoid",
    onDetection: () => {
      onDetect(false);
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

    const isPrtSc = (e: KeyboardEvent) =>
      e.code === "PrintScreen" || e.key === "PrintScreen";

    const onKeyDown = (e: KeyboardEvent) => {
      markChord(e);
      // PrintScreen puts the fresh full-screen image straight in the clipboard.
      if (isScreenshotChord(e)) onDetect(isPrtSc(e));
    };

    // Some Windows builds only expose PrintScreen on keyup
    const onKeyUp = (e: KeyboardEvent) => {
      markChord(e);
      if (isPrtSc(e)) onDetect(true);
    };

    const onBlur = () => {
      if (Date.now() - chordAt.current < 1200) onDetect(false);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden" && Date.now() - chordAt.current < 1200) {
        onDetect(false);
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
  }, [exempt, onDetect]);

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
