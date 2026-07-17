"use server";

// All data access goes through these actions. Inputs travel in payload
// objects (never URL params). RLS enforces row access; triggers enforce
// business rules.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, requireAuth, requireSession } from "@/lib/session";
import { EDITABLE_COLUMNS, TAB_TABLE, DATE_FIELD } from "@/lib/schemas";
import { TABS, USER_ADMIN_ROLES, type TabKey } from "@/lib/constants";
import type { Rec, Attachment, LeadComment, RetentionComment } from "@/lib/types";
import { isDayTimeframe, phoneDigits, type Timeframe } from "@/lib/format";

/** Roster profiles linked to these auth emails stay hidden from Team Setup. */
const HIDDEN_ROSTER_LOGIN_EMAILS = new Set(["yasal.khan@tgtnexus.net"]);

const PIPELINE_COMMENT_TABS: TabKey[] = [
  "leadgen",
  "qa",
  "sqlassign",
  "closer",
  "ops",
  "msp",
  "fulfillment",
  "leasing",
];

// ---------------------------------------------------------------------------
// Timeframe boundaries (blank dates always pass, like the prototype)
// ---------------------------------------------------------------------------
function tfRange(tf: Timeframe): { start: string; end: string } | null {
  if (tf === "All time") return null;
  // Calendar pick: one exact day
  if (isDayTimeframe(tf)) return { start: tf, end: tf };
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
  if (tf === "Last 7 days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start: iso(start), end };
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


/** Match key for duplicate detection — full 10-digit US phone, or normalized email. */
function leadMatchKeys(r: { phone?: unknown; email?: unknown }): { phone: string; email: string } {
  const phone = phoneDigits(r.phone);
  const email = String(r.email || "")
    .trim()
    .toLowerCase();
  return {
    phone: phone.length === 10 ? phone : "",
    email: email.includes("@") ? email : "",
  };
}

/**
 * Oldest lead wins. Newer leads with the same phone or email get duplicate_of = original lead_id.
 * Scans all leads (not just the current timeframe) so older originals still match.
 */
async function markLeadDuplicates(
  rows: Rec[],
  admin: ReturnType<typeof createAdminClient>
): Promise<Rec[]> {
  const { data: all } = await admin
    .from("leads")
    .select("lead_id, phone, email, created_at")
    .order("created_at", { ascending: true });

  const firstPhone = new Map<string, string>();
  const firstEmail = new Map<string, string>();
  const dupOf = new Map<string, string>();

  for (const lead of all || []) {
    const id = String(lead.lead_id || "");
    if (!id) continue;
    const { phone, email } = leadMatchKeys(lead);
    let original: string | null = null;
    if (phone && firstPhone.has(phone)) original = firstPhone.get(phone)!;
    else if (email && firstEmail.has(email)) original = firstEmail.get(email)!;

    if (original) dupOf.set(id, original);
    if (phone && !firstPhone.has(phone)) firstPhone.set(phone, id);
    if (email && !firstEmail.has(email)) firstEmail.set(email, id);
  }

  return rows.map((r) => {
    const id = String(r.lead_id || "");
    const original = dupOf.get(id) || "";
    return { ...r, duplicate_of: original || null };
  });
}

async function enrichAuditNames(
  rows: Rec[],
  admin: ReturnType<typeof createAdminClient>
): Promise<Rec[]> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.created_by) ids.add(String(r.created_by));
    if (r.updated_by) ids.add(String(r.updated_by));
  }
  if (!ids.size) {
    return rows.map((r) => ({ ...r, created_by_name: "", updated_by_name: "" }));
  }
  const { data: profiles } = await admin
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", [...ids]);
  const map = new Map((profiles || []).map((p) => [String(p.user_id), String(p.full_name)]));
  return rows.map((r) => ({
    ...r,
    created_by_name: r.created_by ? map.get(String(r.created_by)) || "" : "",
    updated_by_name: r.updated_by ? map.get(String(r.updated_by)) || "" : "",
  }));
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
      query = supabase.from("profiles").select("*").order("full_name");
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
      rows = await markLeadDuplicates(rows, admin);
    }

    if (payload.tab === "leadgen" || payload.tab === "closer") {
      rows = await enrichAuditNames(rows, admin);
    }

    if (payload.tab === "sqlassign") {
      const { data: open } = await admin
        .from("closer_deals")
        .select("closer")
        .not("stage", "in", '("Closed","Closed Won","Closed Lost","Not Interested")');
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

    if (PIPELINE_COMMENT_TABS.includes(payload.tab) && leadIds.length) {
      const { data: comments } = await supabase
        .from("lead_comments")
        .select("*")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: true });
      const byLead = new Map<string, LeadComment[]>();
      ((comments || []) as LeadComment[]).forEach((c) => {
        const list = byLead.get(c.lead_id) || [];
        list.push(c);
        byLead.set(c.lead_id, list);
      });
      rows = rows.map((r) => ({ ...r, lead_comments: byLead.get(r.lead_id as string) || [] }));
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
        if (d.stage !== "Closed" && d.stage !== "Closed Won" && d.stage !== "Closed Lost" && d.stage !== "Not Interested") {
          open.set(d.closer, (open.get(d.closer) || 0) + 1);
        }
        if ((d.stage === "Closed" || d.stage === "Closed Won") && d.closed_date && d.closed_date >= monthStart) {
          closedMo.set(d.closer, (closedMo.get(d.closer) || 0) + 1);
        }
      });
      rows = rows.map((r) => ({
        ...r,
        open_opps: open.get(String(r.full_name)) || 0,
        closed_month: closedMo.get(String(r.full_name)) || 0,
      }));

      // Login emails are visible to user admins only; always hide selected accounts from roster
      const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const emailById = new Map((usersData?.users || []).map((u) => [u.id, (u.email || "").toLowerCase()]));
      rows = rows.filter((r) => {
        if (!r.user_id) return true;
        const email = emailById.get(String(r.user_id)) || "";
        return !HIDDEN_ROSTER_LOGIN_EMAILS.has(email);
      });
      const session = await getSession();
      if (session && USER_ADMIN_ROLES.includes(session.profile.role_key)) {
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

    if (payload.tab === "leadgen" || payload.tab === "closer") {
      if (payload.id) values.updated_by = session.userId;
      else values.created_by = session.userId;
    }

    const write = async (vals: Record<string, unknown>) =>
      payload.id
        ? supabase.from(table).update(vals).eq("id", payload.id)
        : supabase.from(table).insert(vals);

    let { error } = await write(values);
    // Older DBs may not have audit columns yet — retry without them
    if (error && /updated_by|created_by/i.test(error.message)) {
      const fallback = { ...values };
      delete fallback.updated_by;
      delete fallback.created_by;
      ({ error } = await write(fallback));
    }
    if (error) return { error: error.message };
    if (!payload.id && payload.tab === "leadgen") messages.push("Lead created and sent to QA.");

    // Pipeline lead comments (append-only)
    if (PIPELINE_COMMENT_TABS.includes(payload.tab) && payload.newComment?.trim()) {
      const leadId = String(payload.values.lead_id || "");
      if (leadId) {
        const { error: cErr } = await supabase.from("lead_comments").insert({
          lead_id: leadId,
          author: session.profile.full_name,
          author_id: session.userId,
          body: payload.newComment.trim(),
        });
        if (cErr) return { error: cErr.message };
      }
    }

    // Retention: append-only comment (CS-specific log)
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
    if (payload.tab === "closer" && (v.stage === "Closed" || v.stage === "Closed Won"))
      messages.push(`${biz} closed. Progressed to OPS.`);
    if (payload.tab === "closer" && v.stage === "Closed Lost")
      messages.push(`${biz} closed lost. Recorded and kept in history.`);
    if (payload.tab === "closer" && v.stage === "Not Interested")
      messages.push(`${biz} marked not interested. Recorded and kept in history.`);
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
// Append-only lead comment (works even when the drawer is read-only)
// ---------------------------------------------------------------------------
export async function addLeadComment(payload: {
  leadId: string;
  body: string;
}): Promise<{ ok?: boolean; comment?: LeadComment; error?: string }> {
  try {
    const session = await requireSession();
    const leadId = String(payload.leadId || "").trim();
    const body = String(payload.body || "").trim();
    if (!leadId) return { error: "Missing lead." };
    if (!body) return { error: "Comment cannot be empty." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lead_comments")
      .insert({
        lead_id: leadId,
        author: session.profile.full_name,
        author_id: session.userId,
        body,
      })
      .select("*")
      .single();
    if (error) return { error: error.message };
    return { ok: true, comment: data as LeadComment };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add comment." };
  }
}

/** Fast path: comments for one lead only (keeps drawer snappy). */
export async function fetchLeadComments(payload: {
  leadId: string;
}): Promise<{ comments: LeadComment[]; error?: string }> {
  try {
    await requireAuth();
    const leadId = String(payload.leadId || "").trim();
    if (!leadId) return { comments: [] };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("lead_comments")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    if (error) return { comments: [], error: error.message };
    return { comments: (data || []) as LeadComment[] };
  } catch (e) {
    return { comments: [], error: e instanceof Error ? e.message : "Failed to load comments." };
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
      q = applyTf(q, t.dated ? DATE_FIELD[t.k] : undefined, payload.tf) as typeof q;
      const { count } = await q;
      counts[t.k] = count || 0;
    })
  );

  return counts;
}
