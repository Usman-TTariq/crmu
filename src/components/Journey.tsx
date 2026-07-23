"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { C } from "@/lib/theme";
import { isBlank } from "@/lib/format";
import { PIPE, type TabKey } from "@/lib/constants";
import { fetchJourney } from "@/actions/data";
import { useApp } from "@/components/app-context";

/** Client cache — reopening the same lead should not wait on the network. */
const journeyCache = new Map<string, Record<string, string | null>>();

function optimisticStages(currentKey: TabKey): Record<string, string | null> {
  const idx = PIPE.findIndex(([tk]) => tk === currentKey);
  const stages: Record<string, string | null> = {};
  PIPE.forEach(([tk], i) => {
    // Assume every stage up to the current one exists so pills show instantly.
    stages[tk] = i <= idx ? "optimistic" : null;
  });
  return stages;
}

export default function Journey({
  leadId,
  currentKey,
  viewTabs,
  onPeekStage,
}: {
  leadId: string;
  currentKey: TabKey;
  viewTabs: TabKey[];
  /** View-only stages open in-place (sidebar) instead of navigating away. */
  onPeekStage?: (stageTab: TabKey) => void;
}) {
  const router = useRouter();
  const app = useApp();
  const cached = !isBlank(leadId) ? journeyCache.get(leadId) : undefined;
  const [stages, setStages] = useState<Record<string, string | null> | null>(
    () => cached || (!isBlank(leadId) ? optimisticStages(currentKey) : null)
  );

  useEffect(() => {
    if (isBlank(leadId)) return;
    const hit = journeyCache.get(leadId);
    if (hit) {
      setStages(hit);
      return;
    }
    setStages(optimisticStages(currentKey));
    let alive = true;
    fetchJourney({ leadId }).then((res) => {
      if (!alive) return;
      journeyCache.set(leadId, res.stages);
      setStages(res.stages);
    });
    return () => {
      alive = false;
    };
  }, [leadId, currentKey]);

  const steps = useMemo(() => {
    if (!stages) return [];
    return PIPE.map(([tk, label]) => ({ tk, label, exists: !!stages[tk] }));
  }, [stages]);

  if (isBlank(leadId) || !stages || !steps.some((s) => s.exists)) return null;

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
          const viewOnly = clickable && !app.editTabs.includes(s.tk);
          return (
            <React.Fragment key={s.tk}>
              {i > 0 ? (
                <span style={{ color: s.exists ? C.blue : C.line, fontSize: 11, flexShrink: 0, fontWeight: 700 }}>
                  &rsaquo;
                </span>
              ) : null}
              <button
                onClick={
                  clickable
                    ? () => {
                        if (viewOnly && onPeekStage) {
                          onPeekStage(s.tk);
                          return;
                        }
                        app.jumpTo(s.tk, leadId);
                        router.push(`/${s.tk}`);
                      }
                    : undefined
                }
                disabled={!clickable}
                className={clickable ? "jny" : ""}
                title={
                  !s.exists
                    ? "Not reached yet"
                    : here
                    ? "You are here"
                    : clickable
                    ? viewOnly
                      ? "View this stage here (read-only)"
                      : "Open this record at this stage"
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
