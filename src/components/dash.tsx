"use client";

// Dashboard building blocks, ported 1:1 from the prototype

import React from "react";
import { ArrowRight } from "lucide-react";
import { C, TONES, FUNNEL_COLORS, MIX_COLORS, MEDALS, type Tone } from "@/lib/theme";
import { numfmt } from "@/lib/format";

export function Stat({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="crm-card"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 14,
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.inkSoft,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {label}
        {onClick ? <ArrowRight size={12} style={{ color: C.inkFaint }} /> : null}
      </div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: tone || C.ink, marginTop: 6, lineHeight: 1.1 }}>
        {value}
      </div>
      {sub ? <div style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

export function Bar({
  label,
  value,
  max,
  color,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
  suffix?: string;
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ color: C.ink, fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ color: C.inkSoft, fontWeight: 700 }}>
          {suffix === "%" ? value + "%" : numfmt(value)}
        </span>
      </div>
      <div style={{ height: 7, background: C.lineSoft, borderRadius: 6, overflow: "hidden" }}>
        <div className="bar-fill" style={{ height: "100%", width: w + "%", background: color || C.blue, borderRadius: 6 }} />
      </div>
    </div>
  );
}

/** Stacked horizontal bar for multi-metric timelines (e.g. working / break / away). */
export function StackedBar({
  label,
  segments,
  max,
  right,
}: {
  label: string;
  segments: { value: number; color: string; title?: string }[];
  max: number;
  right?: string;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value || 0), 0);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 8 }}>
        <span style={{ color: C.ink, fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ color: C.inkSoft, fontWeight: 700, flexShrink: 0 }}>
          {right ?? numfmt(total)}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: C.lineSoft,
          borderRadius: 6,
          overflow: "hidden",
          display: "flex",
        }}
        title={segments.map((s) => s.title || "").filter(Boolean).join(" · ")}
      >
        {segments.map((s, i) => {
          const w = max > 0 ? Math.min(100, (Math.max(0, s.value) / max) * 100) : 0;
          if (w <= 0) return null;
          return (
            <div
              key={i}
              style={{
                height: "100%",
                width: w + "%",
                background: s.color,
                flexShrink: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Panel({
  title,
  color,
  children,
  style,
  bodyStyle,
  right,
}: {
  title: string;
  color?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="crm-card fade-up"
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: 16,
        overflow: "hidden",
        minWidth: 0,
        maxWidth: "100%",
        ...(style || {}),
      }}
    >
      <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 9, borderBottom: `1px solid ${C.lineSoft}`, flexShrink: 0 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color || C.blue,
            boxShadow: `0 0 0 4px ${(color || C.blue) + "1f"}`,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: C.inkSoft, flex: 1 }}>
          {title}
        </span>
        {right}
      </div>
      <div style={{ padding: "16px 18px", ...(bodyStyle || {}) }}>{children}</div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  target,
  met,
  sub,
  glow,
}: {
  label: string;
  value: React.ReactNode;
  target: string;
  met: boolean | null;
  sub?: string;
  glow?: boolean;
}) {
  const fg = met === null ? C.inkFaint : met ? TONES.good.fg : TONES.bad.fg;
  const bg = met === null ? C.lineSoft : met ? TONES.good.bg : TONES.bad.bg;
  return (
    <div
      className="crm-card fade-up"
      style={{
        background: C.surface,
        border: `1px solid ${met === false ? TONES.bad.fg + "55" : C.line}`,
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.inkSoft, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </div>
        <div
          className={met === false && glow ? "kpi-glow" : ""}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: bg,
            color: fg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {met === null ? "\u00B7" : met ? "\u2713" : "\u2717"}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 26, fontWeight: 800, color: fg, marginTop: 8 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.inkSoft, marginTop: 3 }}>
        Target: {target}
        {sub ? " \u00B7 " + sub : ""}
      </div>
    </div>
  );
}

export function Donut({
  value,
  label,
  sub,
  color,
}: {
  value: number | null;
  label: string;
  sub: string;
  color: string;
}) {
  const has = value !== null && !isNaN(value);
  const r = 40,
    circ = 2 * Math.PI * r;
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div style={{ textAlign: "center", padding: "6px 4px" }}>
      <svg viewBox="0 0 100 100" style={{ width: 96, height: 96 }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke={C.lineSoft} strokeWidth="11" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * circ} ${circ}`}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dasharray .8s cubic-bezier(.4,0,.2,1)" }}
        />
        <text
          x="50"
          y="55"
          textAnchor="middle"
          fontSize="19"
          fontWeight="800"
          fill={has ? color : C.inkFaint}
          fontFamily="ui-monospace,Menlo,monospace"
        >
          {has ? Math.round(v) + "%" : "-"}
        </text>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkSoft, marginTop: 1 }}>{sub}</div>
    </div>
  );
}

export interface FunnelStep {
  label: string;
  count: number;
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  if (!steps.length) return null;
  const max = Math.max(1, steps[0].count);
  const CX = 168,
    MAXW = 300,
    MINW = 54,
    STEP = 64,
    TXT = 352;
  const w = steps.map((s) => Math.max(MINW, (s.count / max) * MAXW));
  const H = steps.length * STEP;
  return (
    <svg
      viewBox={`0 0 560 ${H}`}
      style={{ width: "100%", maxWidth: "100%", height: "auto", display: "block" }}
      preserveAspectRatio="xMinYMid meet"
    >
      {steps.map((s, i) => {
        const y = i * STEP,
          h = STEP - 10;
        const tw = w[i],
          bw = i < steps.length - 1 ? w[i + 1] : w[i] * 0.86;
        const conv = i === 0 ? null : steps[i - 1].count > 0 ? Math.round((s.count / steps[i - 1].count) * 100) : 0;
        return (
          <g key={s.label}>
            <polygon
              points={`${CX - tw / 2},${y} ${CX + tw / 2},${y} ${CX + bw / 2},${y + h} ${CX - bw / 2},${y + h}`}
              fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]}
              opacity="0.94"
            />
            {tw > 84 ? (
              <text
                x={CX}
                y={y + h / 2 + 5}
                textAnchor="middle"
                fontSize="15"
                fontWeight="800"
                fill="#fff"
                fontFamily="ui-monospace,Menlo,monospace"
              >
                {s.count}
              </text>
            ) : null}
            <text x={TXT} y={y + 19} fontSize="13" fontWeight="700" fill={C.ink}>
              {s.label}
            </text>
            <text
              x={TXT}
              y={y + 37}
              fontSize="12"
              fontWeight="700"
              fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]}
              fontFamily="ui-monospace,Menlo,monospace"
            >
              {s.count}
              {conv !== null ? `  \u00B7  ${conv}% of previous` : "  \u00B7  entry point"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SegmentedDonut({
  items,
  centerLabel,
}: {
  items: { label: string; count: number }[];
  centerLabel: string;
}) {
  const total = items.reduce((s, x) => s + x.count, 0);
  if (!total) return <div style={{ fontSize: 13, color: C.inkFaint }}>No data yet.</div>;
  const r = 40,
    circ = 2 * Math.PI * r;
  const segs = items.reduce<{ label: string; count: number; len: number; off: number }[]>((list, x) => {
    const acc = list.reduce((s, seg) => s + seg.len, 0);
    list.push({ ...x, len: (x.count / total) * circ, off: -acc });
    return list;
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg viewBox="0 0 100 100" style={{ width: 128, height: 128, flexShrink: 0 }}>
        {segs.map((x, i) => (
          <circle
            key={x.label}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={MIX_COLORS[i % MIX_COLORS.length]}
            strokeWidth="13"
            strokeDasharray={`${Math.max(0, x.len - 1.5)} ${circ}`}
            strokeDashoffset={x.off}
            transform="rotate(-90 50 50)"
          />
        ))}
        <text x="50" y="47" textAnchor="middle" fontSize="20" fontWeight="800" fill={C.ink} fontFamily="ui-monospace,Menlo,monospace">
          {total}
        </text>
        <text x="50" y="61" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={C.inkSoft}>
          {centerLabel}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        {items.map((x, i) => (
          <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: MIX_COLORS[i % MIX_COLORS.length], flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{x.label}</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              {x.count}
            </span>
            <span className="mono" style={{ fontSize: 11.5, fontWeight: 700, color: C.inkSoft, width: 38, textAlign: "right" }}>
              {Math.round((x.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface Badge {
  e: string;
  t: string;
}

export function LBRow({
  i,
  isLast,
  name,
  badge,
  rateText,
  chips,
}: {
  i: number;
  isLast: boolean;
  name: string;
  badge: Badge | null;
  rateText: string;
  chips: { t: string; tone: Tone }[];
}) {
  const medal = i < 3;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: isLast ? "none" : `1px solid ${C.lineSoft}` }}>
      <div
        className={medal ? "mono shine" : "mono"}
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: medal ? MEDALS[i].bg : C.lineSoft,
          border: medal ? `1px solid ${MEDALS[i].ring}` : `1px solid ${C.line}`,
          boxShadow: medal ? `0 2px 8px ${MEDALS[i].ring}77, inset 0 1px 0 rgba(255,255,255,0.65)` : "none",
          color: medal ? MEDALS[i].fg : C.inkSoft,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {i + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{name}</div>
          {badge ? (
            <span
              className="shine badge-loop"
              title={badge.t}
              aria-label={badge.t}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#FFF0BE,#F2C14E)",
                border: "1px solid #E7BC4B",
                boxShadow: "0 2px 7px rgba(231,188,75,0.55), inset 0 1px 0 rgba(255,255,255,0.7)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {badge.e}
            </span>
          ) : null}
          <div style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 12.5, color: C.ink, fontWeight: 800, flexShrink: 0 }}>
            {rateText}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
          {chips.map((c) => (
            <span
              key={c.t}
              className="mono"
              style={{ background: c.tone.bg, color: c.tone.fg, borderRadius: 8, padding: "3px 9px", fontSize: 12.5, fontWeight: 700 }}
            >
              {c.t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
