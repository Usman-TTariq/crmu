"use server";

// All data access goes through these actions. Inputs travel in payload
// objects (never URL params). RLS enforces row access; triggers enforce
// business rules.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, requireAuth, requireSession } from "@/lib/session";
import { EDITABLE_COLUMNS, TAB_TABLE, DATE_FIELD } from "@/lib/schemas";
import { TABS, USER_ADMIN_ROLES, type TabKey } from "@/lib/constants";
import type { Rec, Attachment, RetentionComment } from "@/lib/types";
import type { Timeframe } from "@/lib/format";

// ---------------------------------------------------------------------------
// Timeframe boundaries (blank dates always pass, like the prototype)
// ---------------------------------------------------------------------------
function tfRange(tf: Timeframe): { start: string; end: string } | null {
  if (tf === "All time") return null;
  const now = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const end = iso(now);
  if (tf === "Daily") return { start: end, end };
  if (tf === "Weekly") {
    const ws = new Date(now);
    ws.setDate(ws.getDate() - ws.getDay());
    return { start: iso(ws), end };
  }
  const ms = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: iso(ms), end };
}

function applyTf<T extends { or: (filters: string) => T }>(
  q: T,
  field: string | undefined,
  tf: Timeframe
): T {
  if (!field) return q;
  const range = tfRange(tf);
  if (!range) return q;
  return q.or(`${field}.is.null,and(${field}.gte.${range.start},${field}.lte.${range.end})`);
}

// ---------------------------------------------------------------------------
// Fetch rows for a tab (enriched with computed/journey data)
// ---------------------------------------------------------------------------
export interface FetchRowsPayload {
  tab: TabKey;
  tf: Timeframe;
}

export async function fetchRows(payload: FetchRowsPayload): Promise<{
  rows: Rec[];
  error?: string;
}> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const table = TAB_TABLE[payload.tab];
    if (!table) return { rows: [], error: "Unknown tab." };

    let query = supabase.from(table).select("*");
    query = applyTf(query, DATE_FIELD[payload.tab], payload.tf);

    if (payload.tab === "teamsetup") {
      query = supabase.from("profiles").select("*").neq("title", "CEO").order("full_name");
    }

    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };

    let rows = (data || []) as Rec[];

    // sort newest first by the tab's date field
    const df = DATE_FIELD[payload.tab];
    if (df) {
      rows = rows.sort((a, b) => String(b[df] || "").localeCompare(String(a[df] || "")));
    }

    const admin = createAdminClient();
    const leadIds = rows.map((r) => r.lead_id).filter(Boolean) as string[];

    // Enrichments per tab
    if (payload.tab === "leadgen" && leadIds.length) {
      const { data: qa } = await admin
        .from("qa_records")
        .select("lead_id, qa_decision")
        .in("lead_id", leadIds);
      const map = new Map((qa || []).map((q) => [q.lead_id, q.qa_decision]));
      rows = rows.map((r) => ({ ...r, qa_outcome: map.get(r.lead_id as string) || "Not in QA" }));
    }

    if (payload.tab === "sqlassign") {
      const { data: open } = await admin
        .from("closer_deals")
        .select("closer")
        .not("stage", "in", '("Closed Won","Closed Lost")');
      const loads = new Map<string, number>();
      (open || []).forEach((d) => loads.set(d.closer, (loads.get(d.closer) || 0) + 1));
      rows = rows.map((r) => ({
        ...r,
        closer_open_load: loads.get(String(r.assigned_closer || "")) || 0,
      }));
    }

    if ((payload.tab === "closer" || payload.tab === "ops") && leadIds.length) {
      const { data: atts } = await supabase
        .from("attachments")
        .select("*")
        .eq("stage", payload.tab)
        .in("lead_id", leadIds);
      const byLead = new Map<string, Attachment[]>();
      for (const a of (atts || []) as Attachment[]) {
        const { data: signed } = await supabase.storage
          .from("documents")
          .createSignedUrl(a.storage_path, 3600);
        const list = byLead.get(a.lead_id) || [];
        list.push({ ...a, signed_url: signed?.signedUrl });
        byLead.set(a.lead_id, list);
      }
      rows = rows.map((r) => ({ ...r, attachments: byLead.get(r.lead_id as string) || [] }));
    }

    if (payload.tab === "retention" && leadIds.length) {
      const { data: comments } = await supabase
        .from("retention_comments")
        .select("*")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: true });
      const byLead = new Map<string, RetentionComment[]>();
      ((comments || []) as RetentionComment[]).forEach((c) => {
        const list = byLead.get(c.lead_id) || [];
        list.push(c);
        byLead.set(c.lead_id, list);
      });
      rows = rows.map((r) => ({ ...r, comments: byLead.get(r.lead_id as string) || [] }));
    }

    if (payload.tab === "teamsetup") {
      const { data: deals } = await admin
        .from("closer_deals")
        .select("closer, stage, closed_date");
      const monthStart = tfRange("Monthly")!.start;
      const open = new Map<string, number>();
      const closedMo = new Map<string, number>();
      (deals || []).forEach((d) => {
        if (!d.closer) return;
        if (d.stage !== "Closed Won" && d.stage !== "Closed Lost") {
          open.set(d.closer, (open.get(d.closer) || 0) + 1);
        }
        if (d.stage === "Closed Won" && d.closed_date && d.closed_date >= monthStart) {
          closedMo.set(d.closer, (closedMo.get(d.closer) || 0) + 1);
        }
      });
      rows = rows.map((r) => ({
        ...r,
        open_opps: open.get(String(r.full_name)) || 0,
        closed_month: closedMo.get(String(r.full_name)) || 0,
      }));

      // Login emails are visible to user admins only
      const session = await getSession();
      if (session && USER_ADMIN_ROLES.includes(session.profile.role_key)) {
        const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const emailById = new Map((usersData?.users || []).map((u) => [u.id, u.email || ""]));
        rows = rows.map((r) => ({
          ...r,
          login_email: r.user_id ? emailById.get(String(r.user_id)) || "" : "",
        }));
      }
    }

    return { rows };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Failed to load." };
  }
}

// ---------------------------------------------------------------------------
// Journey: which stages does this lead exist in (for the drawer pills)
// ---------------------------------------------------------------------------
export async function fetchJourney(payload: { leadId: string }): Promise<{
  stages: Record<string, string | null>;
}> {
  await requireAuth();
  const admin = createAdminClient();
  const stages: Record<string, string | null> = {};
  const checks: [string, string][] = [
    ["leadgen", "leads"], ["qa", "qa_records"], ["sqlassign", "sql_assignments"],
    ["closer", "closer_deals"], ["ops", "ops_verifications"], ["msp", "msp_onboarding"],
    ["fulfillment", "fulfillment"], ["leasing", "leasing"], ["retention", "retention"],
  ];
  await Promise.all(
    checks.map(async ([tab, table]) => {
      const { data } = await admin
        .from(table)
        .select("id")
        .eq("lead_id", payload.leadId)
        .maybeSingle();
      stages[tab] = data?.id || null;
    })
  );
  return { stages };
}

// ---------------------------------------------------------------------------
// Save (insert or update) — column whitelist + RLS + triggers
// ---------------------------------------------------------------------------
export interface SaveRecordPayload {
  tab: TabKey;
  id: string | null; // null = insert
  values: Record<string, unknown>;
  newComment?: string; // retention only
}

export async function saveRecord(payload: SaveRecordPayload): Promise<{
  ok?: boolean;
  error?: string;
  messages?: string[];
}> {
  try {
    const session = await requireSession();
    const supabase = await createClient();
    const table = TAB_TABLE[payload.tab];
    const allowed = EDITABLE_COLUMNS[payload.tab];
    if (!table || !allowed) return { error: "Unknown tab." };

    const values: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in payload.values) {
        let v = payload.values[k];
        if (v === "" && (k.endsWith("_date") || k === "date_created" || k === "qa_date")) v = null;
        if (v === "" && ["monthly_volume", "monthly_lease", "approved_funding", "shipping_cost"].includes(k)) v = null;
        values[k] = v;
      }
    }

    const messages: string[] = [];

    if (payload.id) {
      const { error } = await supabase.from(table).update(values).eq("id", payload.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from(table).insert(values);
      if (error) return { error: error.message };
      if (payload.tab === "leadgen") messages.push("Lead created and sent to QA.");
    }

    // Retention: append-only comment
    if (payload.tab === "retention" && payload.newComment?.trim()) {
      const leadId = payload.values.lead_id as string;
      const { error } = await supabase.from("retention_comments").insert({
        lead_id: leadId,
        author: session.profile.full_name,
        author_id: session.userId,
        body: payload.newComment.trim(),
      });
      if (error) return { error: error.message };
    }

    // Progress notifications (mirror the prototype's toasts)
    const v = payload.values;
    const biz = String(v.business_name || v.full_name || "Record");
    if (payload.tab === "qa" && v.qa_decision === "Qualified")
      messages.push(`${biz} qualified. Progressed to SQL Assignment.`);
    if (payload.tab === "qa" && v.qa_decision === "Disqualified")
      messages.push(`${biz} disqualified by QA. Recorded and kept in history.`);
    if (payload.tab === "sqlassign" && v.sql_status === "Assigned" && v.assigned_closer)
      messages.push(`${biz} assigned to ${v.assigned_closer}. Progressed to Closer Pipeline.`);
    if (payload.tab === "closer" && v.stage === "Closed Won")
      messages.push(`${biz} closed won. Progressed to OPS.`);
    if (payload.tab === "closer" && v.stage === "Closed Lost")
      messages.push(`${biz} closed lost. Recorded and kept in history.`);
    if (payload.tab === "ops" && v.ops_status === "Approved")
      messages.push(`${biz} OPS-approved. Progressed to Onboarding.`);
    if (payload.tab === "ops" && v.ops_status === "Disapproved")
      messages.push(`${biz} disapproved in OPS. Recorded and kept in history.`);
    if (payload.tab === "msp" && v.final_status === "Archived")
      messages.push(`${biz} archived in Onboarding.`);
    if (payload.tab === "msp" && (v.a1_result === "Yes" || v.a2_result === "Yes" || v.a3_result === "Yes"))
      messages.push(`${biz} onboarding approved. Progressed to Fulfillment.`);
    if (payload.tab === "leasing" && v.funding_status === "Funded")
      messages.push(`${biz} funded. Customer Success record opened.`);

    return { ok: true, messages };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed." };
  }
}

// ---------------------------------------------------------------------------
// Manual OPS addition: creates the lead (FK parent) then the OPS record
// ---------------------------------------------------------------------------
export async function createManualOpsRecord(payload: {
  values: Record<string, unknown>;
}): Promise<{ ok?: boolean; error?: string; messages?: string[] }> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const v = payload.values;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .insert({
        business_name: v.business_name || "",
        owner_name: v.owner_name || "",
        phone: v.phone || "",
        monthly_volume: v.monthly_volume === "" ? null : v.monthly_volume,
        lead_source: "Other",
        notes: "Created manually from OPS.",
      })
      .select("lead_id")
      .single();
    if (leadErr) return { error: leadErr.message };

    const opsValues: Record<string, unknown> = { lead_id: lead.lead_id };
    for (const k of [
      ...EDITABLE_COLUMNS.ops,
      "closed_date", "business_name", "owner_name", "phone", "closer", "monthly_volume",
    ]) {
      if (k in v) {
        let val = v[k];
        if (val === "" && (k.endsWith("_date") || k === "monthly_volume")) val = null;
        opsValues[k] = val;
      }
    }

    const { error: opsErr } = await supabase.from("ops_verifications").insert(opsValues);
    if (opsErr) return { error: opsErr.message };

    return { ok: true, messages: [`OPS record created as ${lead.lead_id}.`] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Create failed." };
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export async function deleteRecord(payload: { tab: TabKey; id: string }): Promise<{
  ok?: boolean;
  error?: string;
}> {
  try {
    await requireAuth();
    const supabase = await createClient();
    const table = TAB_TABLE[payload.tab];
    if (!table) return { error: "Unknown tab." };
    const { error } = await supabase.from(table).delete().eq("id", payload.id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Delete failed." };
  }
}

// ---------------------------------------------------------------------------
// Sidebar counts (RLS-scoped, per timeframe)
// ---------------------------------------------------------------------------
export async function fetchTabCounts(payload: { tf: Timeframe }): Promise<Record<string, number>> {
  await requireAuth();
  const supabase = await createClient();
  const counts: Record<string, number> = {};

  await Promise.all(
    TABS.filter((t) => !t.kind).map(async (t) => {
      const table = TAB_TABLE[t.k];
      if (!table) return;
      let q = supabase.from(table).select("id", { count: "exact", head: true });
      if (t.k === "teamsetup") q = q.neq("title", "CEO") as typeof q;
      q = applyTf(q, t.dated ? DATE_FIELD[t.k] : undefined, payload.tf) as typeof q;
      const { count } = await q;
      counts[t.k] = count || 0;
    })
  );

  return counts;
}
