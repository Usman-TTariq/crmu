// Design tokens — aligned with the login page brand language

export const C = {
  ink: "#12151a",
  inkSoft: "#5c6570",
  inkFaint: "#8a929c",
  bg: "#f7f8fa",
  surface: "#FFFFFF",
  line: "#e2e6eb",
  lineSoft: "#eef1f5",
  side: "#0a0d12",
  sideHi: "#151b24",
  sideText: "#a8b0bb",
  blue: "#ba161c",
  blueDeep: "#8e1015",
  blueSoft: "#fcebec",
  accentOnDark: "#ff6b75",
} as const;

export type Tone = { bg: string; fg: string };

export const TONES: Record<string, Tone> = {
  good: { bg: "#E3F2EA", fg: "#177143" },
  warn: { bg: "#FAF0D8", fg: "#8F6410" },
  dup: { bg: "#FFE8CC", fg: "#C45C12" },
  bad: { bg: "#FAE7E8", fg: "#AE3A44" },
  info: { bg: "#E8F0FA", fg: "#2563AC" },
  neutral: { bg: "#EEF1F5", fg: "#5D6B80" },
};

export const TONE_MAP: Record<string, keyof typeof TONES> = {
  Qualified: "good", Approved: "good", Closed: "good", "Closed Won": "good", Funded: "good", Live: "good",
  Retained: "good", Yes: "good", Active: "good", Passed: "good", Pass: "good", Installed: "good", "On Track": "good",
  Pending: "warn", "Follow Up": "warn", "Docs Pending": "warn", Submitted: "warn",
  "Equipment Shipped": "warn", "At Risk": "warn", "In Progress": "warn", "On Hold": "warn", Archived: "warn", Inactive: "warn",
  "Not Interested": "warn",
  Disqualified: "bad", Declined: "bad", "Closed Lost": "bad", Lost: "bad", Disapproved: "bad",
  "Dispute open": "warn", "Dispute disapproved": "bad", "Dispute approved → QA": "info",
  "Coming after dispute": "info",
  "After dispute": "info",
  Churned: "bad", No: "bad", Fail: "bad", Rejected: "bad", Cancelled: "bad", "Fatal Error": "bad", "Closed by MSP": "bad", Chargeback: "bad",
  New: "info", Assigned: "info", "Docs Received": "info", "No Answer": "neutral", "Not in QA": "neutral",
};

export const toneFor = (v: unknown): Tone => {
  const s = String(v);
  if (s.startsWith("Duplicate")) return TONES.dup;
  return TONES[TONE_MAP[s] || "neutral"];
};

export const FUNNEL_COLORS = ["#8e1015", "#ba161c", "#d4454c", "#1F7A8C", "#177143", "#5c6570"];
export const MIX_COLORS = ["#ba161c", "#1F7A8C", "#177143", "#8F6410", "#6D28D9", "#5D6B80"];
export const NEUTRAL_CHIP: Tone = { bg: "#EEF1F5", fg: "#12151a" };

export const MEDALS = [
  { bg: "linear-gradient(135deg,#FFE9A8,#E7A514)", fg: "#6B4A00", ring: "#F3C64A" },
  { bg: "linear-gradient(135deg,#F3F4F8,#B9C0CC)", fg: "#3E4652", ring: "#C9D0DA" },
  { bg: "linear-gradient(135deg,#F6CFAF,#C07A3C)", fg: "#5C3317", ring: "#DE9F63" },
];
