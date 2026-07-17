// Formatting and date helpers ported from the prototype (real dates, no fixed anchor)

export const num = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

export const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || v === "";

export const money = (v: unknown): string => {
  if (isBlank(v) || isNaN(Number(v))) return "-";
  const n = Number(v);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
};

export const pct = (v: unknown): string => {
  if (isBlank(v) || isNaN(Number(v))) return "-";
  return Math.round(Number(v) * 10) / 10 + "%";
};

export const numfmt = (v: unknown): string => {
  if (isBlank(v) || isNaN(Number(v))) return "-";
  return Number(v).toLocaleString("en-US");
};

export const today = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const dOnly = (s: unknown): string => (s ? String(s).slice(0, 10) : "");

export const dd = (a: unknown, b: unknown): number | null => {
  if (isBlank(a) || isBlank(b)) return null;
  return Math.round((new Date(dOnly(b)).getTime() - new Date(dOnly(a)).getTime()) / 86400000);
};

export const nowStamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Local datetime stamp: 2026-07-17 22:15:03 */
export const stamp = (v: unknown): string => {
  if (isBlank(v)) return "-";
  const d = new Date(String(v));
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const OK_EXT = ["pdf", "jpg", "jpeg", "png", "gif", "webp"];
export const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp"];

export const extOf = (name: string): string =>
  (String(name).split(".").pop() || "").toLowerCase();

export const fileSizeLabel = (b: number): string =>
  b < 1024 * 1024
    ? Math.max(1, Math.round(b / 1024)) + " KB"
    : Math.round((b / 1024 / 1024) * 10) / 10 + " MB";

/** Strip non-digits; drop a leading US country code 1 when present. */
export const phoneDigits = (v: unknown): string => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.slice(0, 10);
};

/** US national format: (555) 123-4567 */
export const formatUsPhone = (v: unknown): string => {
  const d = phoneDigits(v);
  if (!d) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

export type PresetTimeframe = "Daily" | "Weekly" | "Last 7 days" | "Monthly" | "All time";
/** Preset label, or a single calendar day as YYYY-MM-DD */
export type Timeframe = PresetTimeframe | (string & {});
export const TIMEFRAMES: PresetTimeframe[] = ["Daily", "Weekly", "Last 7 days", "Monthly", "All time"];

export const isPresetTimeframe = (tf: string): tf is PresetTimeframe =>
  (TIMEFRAMES as string[]).includes(tf);

/** True when tf is a concrete calendar day (YYYY-MM-DD). */
export const isDayTimeframe = (tf: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(tf);
