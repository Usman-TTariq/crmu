"use client";

import React, { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

/** Client QueryClient for pipeline lists + tab counts (per-user RLS data). */
export default function QueryProvider({
  children,
  cacheKey,
}: {
  children: React.ReactNode;
  /** Bump / change when user or view-as identity changes → fresh cache. */
  cacheKey?: string;
}) {
  const [client] = useState(makeQueryClient);

  useEffect(() => {
    if (!cacheKey) return;
    void client.invalidateQueries();
  }, [cacheKey, client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
