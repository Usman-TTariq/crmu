"use client";

import React, { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { C } from "@/lib/theme";
import { suggestAddresses, resolveAddress, type AddressSuggestion, type ResolvedAddress } from "@/actions/places";

const inputBase: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: C.ink,
  background: C.surface,
  outline: "none",
  fontFamily: "inherit",
};

export default function AddressField({
  value,
  onChange,
  onResolved,
  autoFocus,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved: (parts: ResolvedAddress) => void;
  autoFocus?: boolean;
  label: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [hint, setHint] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

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

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setItems([]);
      setOpen(false);
      setLoading(false);
      setHint("");
      return;
    }

    const seq = ++seqRef.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      suggestAddresses({ query: q }).then((res) => {
        if (seq !== seqRef.current) return;
        setLoading(false);
        if (res.error) setHint(res.error);
        else setHint("");
        setItems(res.suggestions);
        setOpen(res.suggestions.length > 0);
        setActive(res.suggestions.length ? 0 : -1);
      });
    }, 280);

    return () => window.clearTimeout(t);
  }, [value]);

  const pick = async (s: AddressSuggestion) => {
    setOpen(false);
    setItems([]);
    setActive(-1);
    setResolving(true);
    setHint("");
    const res = await resolveAddress({ placeId: s.placeId });
    setResolving(false);
    if (res.error || !res.address) {
      // Fall back to the suggestion label in the address field
      onChange(s.label.split(",")[0]?.trim() || s.label);
      setHint(res.error || "Could not fill city / state / zip.");
      return;
    }
    onResolved(res.address);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || !items.length) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0 && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {label}
      <div style={{ position: "relative" }}>
        <input
          autoFocus={autoFocus}
          type="text"
          autoComplete="off"
          placeholder="Start typing a US street address…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (items.length) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          style={inputBase}
        />
        {(loading || resolving) && (
          <span
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 11,
              fontWeight: 700,
              color: C.inkFaint,
            }}
          >
            {resolving ? "Filling…" : "Searching…"}
          </span>
        )}
      </div>

      {open && items.length > 0 ? (
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
          {items.map((s, i) => {
            const on = i === active;
            return (
              <li key={s.placeId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(s)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
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
                  <MapPin size={15} style={{ color: C.blueDeep, flexShrink: 0, marginTop: 2 }} />
                  <span>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hint ? (
        <div style={{ marginTop: 6, fontSize: 11.5, color: C.inkFaint }}>{hint}</div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 11.5, color: C.inkFaint }}>
          Pick a suggestion to autofill city, state, and zip.
        </div>
      )}
    </div>
  );
}
