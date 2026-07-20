"use client";

// Silent activity tracker for every signed-in user.
// Reports heartbeats: logged in, away (2+ min idle), or logged out.

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { markPresenceOffline, sendPresenceHeartbeat } from "@/actions/presence";

const HEARTBEAT_MS = 30_000;
const MOVE_THROTTLE_MS = 1_000;

function tabOf(pathname: string): string {
  const seg = (pathname || "/").split("/").filter(Boolean)[0] || "home";
  return seg.slice(0, 40);
}

export default function PresenceTracker() {
  const pathname = usePathname();
  const lastInput = useRef(Date.now());
  const lastMoveBump = useRef(0);
  const clicks = useRef(0);
  const keys = useRef(0);
  const scrolls = useRef(0);
  const tabRef = useRef(tabOf(pathname));
  const sending = useRef(false);
  const pulseRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    tabRef.current = tabOf(pathname);
  }, [pathname]);

  useEffect(() => {
    const bump = () => {
      lastInput.current = Date.now();
    };
    const bumpMove = () => {
      const now = Date.now();
      if (now - lastMoveBump.current < MOVE_THROTTLE_MS) return;
      lastMoveBump.current = now;
      bump();
    };
    const onClick = () => {
      bump();
      clicks.current += 1;
    };
    const onKey = () => {
      bump();
      keys.current += 1;
    };
    const onScroll = () => {
      bump();
      scrolls.current += 1;
    };

    const pulse = async () => {
      if (sending.current) return;
      sending.current = true;
      const idleSeconds = Math.floor((Date.now() - lastInput.current) / 1000);
      const focused = typeof document !== "undefined" ? !document.hidden : true;
      const payload = {
        tab: tabRef.current,
        idleSeconds: Math.min(idleSeconds, 86_400),
        focused,
        clicks: clicks.current,
        keys: keys.current,
        scrolls: scrolls.current,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : "",
      };
      clicks.current = 0;
      keys.current = 0;
      scrolls.current = 0;
      try {
        await sendPresenceHeartbeat(payload);
      } catch {
        // best-effort; never block the UI
      } finally {
        sending.current = false;
      }
    };
    pulseRef.current = pulse;

    const onVis = () => {
      if (!document.hidden) {
        bump();
        void pulse();
      }
    };

    window.addEventListener("mousemove", bumpMove, { passive: true });
    window.addEventListener("mousedown", onClick, { passive: true });
    window.addEventListener("keydown", onKey, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("touchstart", bump, { passive: true });
    document.addEventListener("visibilitychange", onVis);

    void pulse();
    const timer = window.setInterval(() => void pulse(), HEARTBEAT_MS);

    // Only mark offline on real tab/window close — NOT on React remount
    // (Strict Mode / soft nav), which was wiping declared breaks instantly.
    const onHide = () => {
      void markPresenceOffline();
    };
    window.addEventListener("pagehide", onHide);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("mousemove", bumpMove);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("touchstart", bump);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return null;
}
