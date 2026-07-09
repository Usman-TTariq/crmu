"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { C } from "@/lib/theme";
import { isBlank } from "@/lib/format";
import { PIPE, type TabKey } from "@/lib/constants";
import { fetchJourney } from "@/actions/data";

export default function Journey({
  leadId,
  currentKey,
  viewTabs,
}: {
  leadId: string;
  currentKey: TabKey;
  viewTabs: TabKey[];
}) {
  const router = useRouter();
  const [stages, setStages] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    if (isBlank(leadId)) return;
    let alive = true;
    fetchJourney({ leadId }).then((res) => {
      if (alive) setStages(res.stages);
    });
    return () => {
      alive = false;
    };
  }, [leadId]);

  if (isBlank(leadId) || !stages) return null;
  const steps = PIPE.map(([tk, label]) => ({ tk, label, exists: !!stages[tk] }));
  if (!steps.some((s) => s.exists)) return null;

  return (
    <div style={{ margin: "14px 22px 0" }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: C.inkFaint,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 7,
        }}
      >
        Lead journey &middot; {leadId}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
        {steps.map((s, i) => {
          const here = s.tk === currentKey;
          const clickable = s.exists && !here && viewTabs.includes(s.tk);
          return (
            <React.Fragment key={s.tk}>
              {i > 0 ? (
                <span style={{ color: s.exists ? C.blue : C.line, fontSize: 11, flexShrink: 0, fontWeight: 700 }}>
                  &rsaquo;
                </span>
              ) : null}
              <button
                onClick={clickable ? () => router.push(`/${s.tk}`) : undefined}
                disabled={!clickable}
                className={clickable ? "jny" : ""}
                title={
                  !s.exists
                    ? "Not reached yet"
                    : here
                    ? "You are here"
                    : clickable
                    ? "Open this stage"
                    : "Not visible to your role"
                }
                style={{
                  flexShrink: 0,
                  border: here ? `1.5px solid ${C.blue}` : `1px solid ${s.exists ? C.blue + "44" : C.line}`,
                  background: here ? C.blue : s.exists ? C.blueSoft : C.lineSoft,
                  color: here ? "#fff" : s.exists ? C.blueDeep : C.inkFaint,
                  borderRadius: 20,
                  padding: "4px 11px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: clickable ? "pointer" : "default",
                  opacity: s.exists ? 1 : 0.65,
                }}
              >
                {s.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
