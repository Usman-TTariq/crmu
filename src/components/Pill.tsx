"use client";

import { C, toneFor } from "@/lib/theme";
import { isBlank } from "@/lib/format";

export default function Pill({ value }: { value: unknown }) {
  if (isBlank(value)) return <span style={{ color: C.inkFaint }}>-</span>;
  const t = toneFor(value);
  return (
    <span
      style={{ background: t.bg, color: t.fg }}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
    >
      {String(value)}
    </span>
  );
}
