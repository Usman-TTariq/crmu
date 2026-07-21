"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import PipelinePage from "@/components/PipelinePage";
import { PIPE, type TabKey } from "@/lib/constants";

/** One shared page module for all pipeline tabs — avoids recompiling each route in dev. */
const PIPELINE_TABS = new Set<string>(PIPE.map(([k]) => k));

export default function PipelineTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = use(params);
  if (!PIPELINE_TABS.has(tab)) notFound();
  return <PipelinePage tab={tab as TabKey} />;
}
