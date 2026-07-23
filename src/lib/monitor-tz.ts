/** Wall clock for Employee Monitor day buckets + screenshot stamps. */
export const MONITOR_TZ = "America/Los_Angeles";

/** Today's calendar date in Pacific (YYYY-MM-DD). */
export function todayMonitor(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MONITOR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Readable Pacific stamp for screenshots / monitor labels. */
export function formatMonitorStamp(v: unknown): string {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MONITOR_TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/**
 * UTC ISO bounds for one Pacific calendar day (handles PST/PDT).
 * Used by admin fallbacks when RPCs are unavailable.
 */
export function monitorDayUtcRange(day: string): { start: string; end: string } {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  if (!y || !m || !d) {
    return { start: `${day}T08:00:00.000Z`, end: `${day}T08:00:00.000Z` };
  }

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MONITOR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  // Search a window around the civil day for Pacific midnight.
  let startMs: number | null = null;
  const from = Date.UTC(y, m - 1, d - 1, 0, 0, 0);
  const to = Date.UTC(y, m - 1, d + 2, 0, 0, 0);
  for (let t = from; t < to; t += 60_000) {
    const parts = fmt.formatToParts(new Date(t));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value || "";
    if (
      get("year") === String(y) &&
      get("month") === String(m).padStart(2, "0") &&
      get("day") === String(d).padStart(2, "0") &&
      get("hour") === "00" &&
      get("minute") === "00" &&
      get("second") === "00"
    ) {
      startMs = t;
      break;
    }
  }

  if (startMs == null) {
    // Fallback: assume PST (UTC-8)
    startMs = Date.UTC(y, m - 1, d, 8, 0, 0);
  }

  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86_400_000).toISOString(),
  };
}
