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

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const OK_EXT = ["pdf", "jpg", "jpeg", "png", "gif", "webp"];
export const IMG_EXT = ["jpg", "jpeg", "png", "gif", "webp"];

export const extOf = (name: string): string =>
  (String(name).split(".").pop() || "").toLowerCase();

export const fileSizeLabel = (b: number): string =>
  b < 1024 * 1024
    ? Math.max(1, Math.round(b / 1024)) + " KB"
    : Math.round((b / 1024 / 1024) * 10) / 10 + " MB";

export type Timeframe = "Daily" | "Weekly" | "Last 7 days" | "Monthly" | "All time";
export const TIMEFRAMES: Timeframe[] = ["Daily", "Weekly", "Last 7 days", "Monthly", "All time"];
