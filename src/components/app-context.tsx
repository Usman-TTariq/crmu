"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { Profile, SessionInfo } from "@/lib/types";
import type { Timeframe } from "@/lib/format";
import { roleByKey, resolveTabs, type RoleDef, type TabKey, CEO_ROLES, MGR_ROLES, DELETE_ROLES } from "@/lib/constants";
import type { OptsCtx } from "@/lib/schemas";

export interface Toast {
  id: string;
  text: string;
}

interface AppCtx {
  session: SessionInfo;
  profiles: Profile[];
  role: RoleDef;
  viewTabs: TabKey[];
  editTabs: TabKey[];
  canSeeCeo: boolean;
  isManager: boolean;
  canDelete: boolean;
  opts: OptsCtx;
  tf: Timeframe;
  setTf: (tf: Timeframe) => void;
  query: string;
  setQuery: (q: string) => void;
  toasts: Toast[];
  pushToasts: (msgs: string[]) => void;
  requestAdd: () => void;
  onAdd: (fn: () => void) => () => void;
  counts: Record<string, number>;
  setCounts: (c: Record<string, number>) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function AppProvider({
  session,
  profiles,
  children,
}: {
  session: SessionInfo;
  profiles: Profile[];
  children: React.ReactNode;
}) {
  const [tf, setTf] = useState<Timeframe>("All time");
  const [query, setQuery] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const addListeners = useRef(new Set<() => void>());

  const pushToasts = useCallback((msgs: string[]) => {
    const items = msgs.map((m) => ({ id: uid(), text: m }));
    setToasts((t) => [...t, ...items]);
    items.forEach((it) =>
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== it.id)), 4600)
    );
  }, []);

  const requestAdd = useCallback(() => {
    addListeners.current.forEach((fn) => fn());
  }, []);

  const onAdd = useCallback((fn: () => void) => {
    addListeners.current.add(fn);
    return () => {
      addListeners.current.delete(fn);
    };
  }, []);

  const role = roleByKey(session.profile.role_key);

  const opts: OptsCtx = useMemo(() => {
    const byTitle = (...titles: string[]) =>
      profiles.filter((p) => titles.includes(p.title) && p.is_active).map((p) => p.full_name);
    return {
      leadgenAgents: byTitle("Lead Gen Agent", "Lead Gen Supervisor"),
      qaAgents: byTitle("QA Agent"),
      closers: byTitle("Closer", "Tier 3"),
      opsVerifiers: byTitle("QA & Funding Lead", "Quality Assurance"),
      onboarders: byTitle("Onboarding Lead", "Onboarding Agent"),
      csAgents: byTitle("Customer Success Head", "Customer Success Lead", "Customer Success Agent"),
      assigners: byTitle("Sales Head & QA", "Manager", "Assistant Manager"),
    };
  }, [profiles]);

  const value: AppCtx = useMemo(
    () => ({
      session,
      profiles,
      role,
      viewTabs: resolveTabs(role.view),
      editTabs: resolveTabs(role.edit),
      canSeeCeo: CEO_ROLES.includes(role.key),
      isManager: MGR_ROLES.includes(role.key),
      canDelete: DELETE_ROLES.includes(role.key),
      opts,
      tf,
      setTf,
      query,
      setQuery,
      toasts,
      pushToasts,
      requestAdd,
      onAdd,
      counts,
      setCounts,
    }),
    [session, profiles, role, opts, tf, query, toasts, pushToasts, requestAdd, onAdd, counts]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
