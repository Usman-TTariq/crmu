// Design tokens ported 1:1 from the TGT CRM prototype

export const C = {
  ink: "#1B1517",
  inkSoft: "#332B2E",
  inkFaint: "#544A4D",
  bg: "#F7F4F3",
  surface: "#FFFFFF",
  line: "#EAE2E3",
  lineSoft: "#F3EEEF",
  side: "#141011",
  sideHi: "#291B1E",
  sideText: "#BCAFB2",
  blue: "#C4132F",
  blueDeep: "#8C0F22",
  blueSoft: "#FCEBEE",
  accentOnDark: "#FF5568",
} as const;

export type Tone = { bg: string; fg: string };

export const TONES: Record<string, Tone> = {
  good: { bg: "#E3F2EA", fg: "#177143" },
  warn: { bg: "#FAF0D8", fg: "#8F6410" },
  bad: { bg: "#FAE7E8", fg: "#AE3A44" },
  info: { bg: "#E8F0FA", fg: "#2563AC" },
  neutral: { bg: "#EEF1F5", fg: "#5D6B80" },
};

export const TONE_MAP: Record<string, keyof typeof TONES> = {
  Qualified: "good", Approved: "good", "Closed Won": "good", Funded: "good", Live: "good",
  Retained: "good", Yes: "good", Active: "good", Passed: "good", Pass: "good", Installed: "good", "On Track": "good",
  Pending: "warn", "Follow Up": "warn", "Docs Pending": "warn", Submitted: "warn",
  "Equipment Shipped": "warn", "At Risk": "warn", "In Progress": "warn", "On Hold": "warn", Archived: "warn", Inactive: "warn",
  Disqualified: "bad", Declined: "bad", "Closed Lost": "bad", Lost: "bad", Disapproved: "bad",
  Churned: "bad", No: "bad", Fail: "bad", Rejected: "bad", Cancelled: "bad", "Fatal Error": "bad", "Closed by MSP": "bad", Chargeback: "bad",
  New: "info", Assigned: "info", "Docs Received": "info", "No Answer": "neutral", "Not in QA": "neutral",
};

export const toneFor = (v: unknown): Tone =>
  TONES[TONE_MAP[String(v)] || "neutral"];

export const FUNNEL_COLORS = ["#7E0E1F", "#9C1226", "#C4132F", "#D84557", "#1F7A8C", "#177143"];
export const MIX_COLORS = ["#C4132F", "#1F7A8C", "#177143", "#8F6410", "#6D28D9", "#5D6B80"];
export const NEUTRAL_CHIP: Tone = { bg: "#EDE7E8", fg: "#1B1517" };

export const MEDALS = [
  { bg: "linear-gradient(135deg,#FFE9A8,#E7A514)", fg: "#6B4A00", ring: "#F3C64A" },
  { bg: "linear-gradient(135deg,#F3F4F8,#B9C0CC)", fg: "#3E4652", ring: "#C9D0DA" },
  { bg: "linear-gradient(135deg,#F6CFAF,#C07A3C)", fg: "#5C3317", ring: "#DE9F63" },
];
