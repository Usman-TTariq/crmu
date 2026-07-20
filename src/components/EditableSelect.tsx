"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { C } from "@/lib/theme";

const base: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  padding: "10px 36px 10px 12px",
  fontSize: 14,
  color: C.ink,
  background: C.surface,
  outline: "none",
  fontFamily: "inherit",
};

function displayFor(value: string, options: string[], optLabel?: (v: string) => string): string {
  if (!value) return "";
  if (optLabel && options.includes(value)) return optLabel(value);
  return value;
}

export default function EditableSelect({
  value,
  options,
  optLabel,
  disabled,
  autoFocus,
  placeholder = "-",
  onChange,
  commit,
}: {
  value: string;
  options: string[];
  optLabel?: (v: string) => string;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
  /** Normalize / map free text → stored value on blur or pick */
  commit?: (raw: string) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => displayFor(value, options, optLabel));

  useEffect(() => {
    if (!focused) setText(displayFor(value, options, optLabel));
  }, [value, options, optLabel, focused]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const label = (optLabel ? optLabel(o) : o).toLowerCase();
      return label.includes(q) || o.toLowerCase().includes(q);
    });
  }, [options, optLabel, text]);

  const apply = (raw: string) => {
    const next = commit ? commit(raw) : raw;
    onChange(next);
    setText(displayFor(next, options, optLabel));
  };

  const pick = (code: string) => {
    apply(code);
    setOpen(false);
    setActive(-1);
    setFocused(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      setActive(0);
      return;
    }
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter" && open && active >= 0 && filtered[active]) {
      e.preventDefault();
      pick(filtered[active]);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          autoFocus={autoFocus}
          type="text"
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            setOpen(true);
            setActive(0);
            onChange(v);
          }}
          onFocus={() => {
            setFocused(true);
            setText(displayFor(value, options, optLabel));
            setOpen(true);
            setActive(-1);
          }}
          onBlur={() => {
            setFocused(false);
            apply(text);
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          style={{
            ...base,
            background: disabled ? C.lineSoft : C.surface,
            color: disabled ? C.inkSoft : C.ink,
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Toggle options"
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            setOpen((o) => !o);
          }}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
            padding: 4,
            cursor: disabled ? "not-allowed" : "pointer",
            color: C.ink,
            display: "flex",
            alignItems: "center",
          }}
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {open && !disabled && filtered.length > 0 ? (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            zIndex: 40,
            left: 0,
            right: 0,
            top: "100%",
            margin: "4px 0 0",
            padding: 6,
            listStyle: "none",
            background: C.surface,
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            boxShadow: "0 14px 36px rgba(46,4,10,0.18)",
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {filtered.map((o, i) => {
            const on = i === active || o === value;
            const label = optLabel ? optLabel(o) : o;
            return (
              <li key={o}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 10px",
                    background: on ? C.blueSoft : "transparent",
                    color: C.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13.5,
                    fontWeight: on ? 600 : 500,
                  }}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
