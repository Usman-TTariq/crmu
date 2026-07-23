"use client";

// Silent activity tracker for every signed-in user.
// Reports heartbeats: logged in, away (2+ min idle), or logged out.
// Calls Supabase RPC with the browser JWT (skips Next server-action hop).

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const HEARTBEAT_ACTIVE_MS = 45_000;
const HEARTBEAT_IDLE_MS = 60_000;
const IDLE_STABLE_S = 120;
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
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    tabRef.current = tabOf(pathname);
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();

    const bump = () => {
      // If they were past the Away threshold, flush a heartbeat immediately
      // so Monitor flips back to Logged in without waiting for the next tick.
      const idleBefore = Math.floor((Date.now() - lastInput.current) / 1000);
      lastInput.current = Date.now();
      if (idleBefore >= IDLE_STABLE_S) {
        void pulseRef.current();
      }
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

    const scheduleNext = (idleSeconds: number) => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      const delay = idleSeconds >= IDLE_STABLE_S ? HEARTBEAT_IDLE_MS : HEARTBEAT_ACTIVE_MS;
      timerRef.current = window.setTimeout(() => void pulseRef.current(), delay);
    };

    const pulse = async () => {
      if (sending.current) return;
      sending.current = true;
      const idleSeconds = Math.floor((Date.now() - lastInput.current) / 1000);
      const focused = typeof document !== "undefined" ? !document.hidden : true;
      const payload = {
        p_tab: tabRef.current,
        p_idle_seconds: Math.min(idleSeconds, 86_400),
        p_focused: focused,
        p_clicks: clicks.current,
        p_keys: keys.current,
        p_scrolls: scrolls.current,
        p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 240) : "",
      };
      clicks.current = 0;
      keys.current = 0;
      scrolls.current = 0;
      try {
        await supabase.rpc("presence_heartbeat", payload);
      } catch {
        // best-effort; never block the UI
      } finally {
        sending.current = false;
        scheduleNext(idleSeconds);
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

    // Let the first screen fetch finish before competing for the connection.
    const boot = window.setTimeout(() => void pulse(), 2000);

    // Only mark offline on real tab/window close — NOT on React remount
    // (Strict Mode / soft nav), which was wiping declared breaks instantly.
    const onHide = () => {
      void supabase.rpc("presence_offline");
    };
    window.addEventListener("pagehide", onHide);

    return () => {
      window.clearTimeout(boot);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
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
