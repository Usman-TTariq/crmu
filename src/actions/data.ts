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
import { logActivity } from "@/lib/activity-log";

/** Roster profiles linked to these auth emails stay hidden from Team Setup. */
const HIDDEN_ROSTER_LOGIN_EMAILS = new Set(["yasal.khan@tgtnexus.net"]);

/** Map auth user id → email. Prefer direct auth.users read; fall back to listUsers. */
async function loadAuthEmailsById(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!userIds.length) return map;

  try {
    const { data, error } = await admin
      .schema("auth")
      .from("users")
      .select("id, email")
      .in("id", userIds);
    if (!error && data?.length) {
      for (const u of data) {
        if (u.id && u.email) map.set(String(u.id), String(u.email).toLowerCase());
      }
      return map;
    }
  } catch {
    // auth schema may be blocked via PostgREST — fall through
  }

  const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of usersData?.users || []) {
    if (u.id && u.email) map.set(u.id, u.email.toLowerCase());
  }
  return map;
}

const PIPELINE_COMMENT_TABS: TabKey[] = [
  "leadgen",
  "qa",
  "sqlassign",
  "closer",
  "documentation",
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

/** Escape a value for use inside a PostgREST `or=(...)` filter fragment. */
function filterValue(raw: string): string {
  return raw.replace(/[,()]/g, "").replace(/%/g, "").replace(/_/g, "");
}

/**
 * Oldest lead wins. Newer leads with the same phone or email get duplicate_of = original lead_id.
 * Only loads candidates that share a phone/email with the current page (not the whole table).
 */
async function markLeadDuplicates(
  rows: Rec[],
  admin: ReturnType<typeof createAdminClient>
): Promise<Rec[]> {
  if (!rows.length) return rows;

  const phones = new Set<string>();
  const emails = new Set<string>();
  for (const r of rows) {
    const { phone, email } = leadMatchKeys({ phone: r.phone, email: r.email });
    if (phone) phones.add(phone);
    if (email) emails.add(email);
  }
  if (!phones.size && !emails.size) {
    return rows.map((r) => ({ ...r, duplicate_of: null }));
  }

  const orParts: string[] = [];
  for (const e of emails) {
    const v = filterValue(e);
    if (v) orParts.push(`email.ilike.${v}`);
  }
  for (const p of phones) {
    // Match formatted US phones e.g. (555) 123-4567 via digit chunks
    const a = p.slice(0, 3);
    const b = p.slice(3, 6);
    const c = p.slice(6);
    orParts.push(`phone.ilike.%${a}%${b}%${c}%`);
  }

  let candidates: { lead_id: string; phone: unknown; email: unknown; created_at: string }[] = [];
  if (orParts.length) {
    const { data } = await admin
      .from("leads")
      .select("lead_id, phone, email, created_at")
      .or(orParts.join(","))
      .order("created_at", { ascending: true });
    candidates = (data || []) as typeof candidates;
  }

  const firstPhone = new Map<string, string>();
  const firstEmail = new Map<string, string>();
  const dupOf = new Map<string, string>();

  for (const lead of candidates) {
    const id = String(lead.lead_id || "");
    if (!id) continue;
    const { phone, email } = leadMatchKeys({ phone: lead.phone, email: lead.email });
    const trackPhone = !!(phone && phones.has(phone));
    const trackEmail = !!(email && emails.has(email));
    if (!trackPhone && !trackEmail) continue;

    let original: string | null = null;
    if (trackPhone && firstPhone.has(phone)) original = firstPhone.get(phone)!;
    else if (trackEmail && firstEmail.has(email)) original = firstEmail.get(email)!;

    if (original) dupOf.set(id, original);
    if (trackPhone && !firstPhone.has(phone)) firstPhone.set(phone, id);
    if (trackEmail && !firstEmail.has(email)) firstEmail.set(email, id);
  }

  return rows.map((r) => {
    const id = String(r.lead_id || "");
    const original = dupOf.get(id) || "";
    return { ...r, duplicate_of: original || null };
  });
}

/** Text columns used by header search (server-side ILIKE). */
const SEARCH_FIELDS: Partial<Record<TabKey, string[]>> = {
  leadgen: ["lead_id", "business_name", "owner_name", "phone", "email", "lead_gen_agent", "city", "state"],
  qa: [
    "lead_id", "business_name", "owner_name", "phone", "email", "city", "state",
    "lead_source", "qa_agent", "qa_decision",
  ],
  sqlassign: ["lead_id", "business_name", "owner_name", "phone", "assigned_closer", "assigned_by", "sql_status"],
  closer: ["lead_id", "business_name", "owner_name", "phone", "closer", "stage"],
  documentation: ["lead_id", "business_name", "owner_name", "phone", "pm_name", "decision"],
  ops: ["lead_id", "business_name", "owner_name", "phone", "closer", "ops_agent", "ops_status", "brand"],
  msp: ["lead_id", "business_name", "owner_name", "onboarding_sp", "final_status", "device", "tracking_number"],
  fulfillment: ["lead_id", "business_name", "owner_name", "fulfillment_stage", "hardware", "serial"],
  leasing: ["lead_id", "business_name", "owner_name", "leasing_company", "funding_status", "invoice_no"],
  retention: ["lead_id", "business_name", "team", "agent_name", "substitute", "status"],
};

const DEFAULT_PAGE_SIZE = 50;

function applySearch<T extends { or: (filters: string) => T }>(
  q: T,
  tab: TabKey,
  search: string
): T {
  const term = filterValue(search.trim());
  if (!term) return q;
  const fields = SEARCH_FIELDS[tab];
  if (!fields?.length) return q;
  // Quote pattern so spaces / special chars are safe in PostgREST or=()
  const pattern = `"%${term}%"`;
  const parts = fields.map((f) => `${f}.ilike.${pattern}`);
  return q.or(parts.join(","));
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
  /** 1-based page; ignored for teamsetup (full roster). */
  page?: number;
  pageSize?: number;
  /** Header search — server-side ILIKE across tab fields. */
  q?: string;
}

/** `list` skips drawer-only extras (comments / signed file URLs) for faster paging. */
async function enrichPipelineRows(
  tab: TabKey,
  rows: Rec[],
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: ReturnType<typeof createAdminClient>,
  mode: "list" | "full" = "full"
): Promise<Rec[]> {
  if (!rows.length) return rows;
  let out = rows;
  const leadIds = out.map((r) => r.lead_id).filter(Boolean) as string[];

  if (tab === "leadgen" && leadIds.length) {
    const [qaRes, dispRes, withDups, audited] = await Promise.all([
      admin.from("qa_records").select("lead_id, qa_decision").in("lead_id", leadIds),
      admin
        .from("qa_disputes")
        .select("lead_id, status, reason, review_note, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false }),
      markLeadDuplicates(out, admin),
      enrichAuditNames(out, admin),
    ]);
    const map = new Map((qaRes.data || []).map((q) => [q.lead_id, q.qa_decision]));
    const latestDispute = new Map<string, { status: string; reason: string; review_note: string }>();
    // Ignore missing table until sql/33 is applied
    if (!dispRes.error) {
      for (const d of dispRes.data || []) {
        if (!latestDispute.has(d.lead_id)) {
          latestDispute.set(d.lead_id, {
            status: d.status,
            reason: d.reason || "",
            review_note: d.review_note || "",
          });
        }
      }
    }
    out = withDups.map((r, i) => {
      const lid = r.lead_id as string;
      const disp = latestDispute.get(lid);
      return {
        ...r,
        qa_outcome: map.get(lid) || "Not in QA",
        dispute_status: disp?.status || "",
        dispute_reason: disp?.reason || "",
        dispute_review_note: disp?.review_note || "",
        created_by_name: audited[i]?.created_by_name || "",
        updated_by_name: audited[i]?.updated_by_name || "",
      };
    });
  } else if (tab === "qa" && leadIds.length) {
    out = out.map((r) => ({
      ...r,
      after_dispute: r.returned_after_dispute ? "After dispute" : "",
    }));
  } else if (tab === "closer") {
    out = await enrichAuditNames(out, admin);
  }

  if (tab === "sqlassign") {
    const { data: open } = await admin
      .from("closer_deals")
      .select("closer")
      .not("stage", "in", '("Closed","Closed Won","Closed Lost","Not Interested")');
    const loads = new Map<string, number>();
    (open || []).forEach((d) => loads.set(d.closer, (loads.get(d.closer) || 0) + 1));
    out = out.map((r) => ({
      ...r,
      closer_open_load: loads.get(String(r.assigned_closer || "")) || 0,
    }));
  }

  if ((tab === "closer" || tab === "ops" || tab === "documentation") && leadIds.length) {
    const stageFilter = tab === "documentation" ? ["closer", "documentation"] : [tab];
    const { data: atts } = await supabase
      .from("attachments")
      .select("*")
      .in("stage", stageFilter)
      .in("lead_id", leadIds);
    const byLead = new Map<string, Attachment[]>();
    if (mode === "full") {
      await Promise.all(
        ((atts || []) as Attachment[]).map(async (a) => {
          const { data: signed } = await supabase.storage
            .from("documents")
            .createSignedUrl(a.storage_path, 3600);
          const list = byLead.get(a.lead_id) || [];
          list.push({ ...a, signed_url: signed?.signedUrl });
          byLead.set(a.lead_id, list);
        })
      );
    } else {
      for (const a of (atts || []) as Attachment[]) {
        const list = byLead.get(a.lead_id) || [];
        list.push(a);
        byLead.set(a.lead_id, list);
      }
    }
    out = out.map((r) => ({ ...r, attachments: byLead.get(r.lead_id as string) || [] }));
  }

  // Comments are drawer-only (hideTable) — skip on list pages for faster paging.
  if (mode === "full" && PIPELINE_COMMENT_TABS.includes(tab) && leadIds.length) {
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
    out = out.map((r) => ({ ...r, lead_comments: byLead.get(r.lead_id as string) || [] }));
  }

  if (mode === "full" && tab === "retention" && leadIds.length) {
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
    out = out.map((r) => ({ ...r, comments: byLead.get(r.lead_id as string) || [] }));
  }

  return out;
}

export async function fetchRows(payload: FetchRowsPayload): Promise<{
  rows: Rec[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}> {
  const page = Math.max(1, payload.page || 1);
  const pageSize = Math.min(200, Math.max(1, payload.pageSize || DEFAULT_PAGE_SIZE));

  try {
    await requireAuth();
    const supabase = await createClient();
    const table = TAB_TABLE[payload.tab];
    if (!table) return { rows: [], total: 0, page, pageSize, error: "Unknown tab." };

    const admin = createAdminClient();

    // Team Setup: full roster (no pagination) — used by teamsetup page only.
    if (payload.tab === "teamsetup") {
      let query = supabase.from("profiles").select("*").order("full_name");
      const { data, error } = await query;
      if (error) return { rows: [], total: 0, page: 1, pageSize, error: error.message };

      let rows = (data || []) as Rec[];
      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean).map(String))];
      const [dealsRes, session, emailById] = await Promise.all([
        admin.from("closer_deals").select("closer, stage, closed_date"),
        getSession(),
        loadAuthEmailsById(admin, userIds),
      ]);

      const monthStart = tfRange("Monthly")!.start;
      const open = new Map<string, number>();
      const closedMo = new Map<string, number>();
      (dealsRes.data || []).forEach((d) => {
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
      rows = rows.filter((r) => {
        if (!r.user_id) return true;
        const email = emailById.get(String(r.user_id)) || "";
        return !HIDDEN_ROSTER_LOGIN_EMAILS.has(email);
      });
      if (session && USER_ADMIN_ROLES.includes(session.profile.role_key)) {
        rows = rows.map((r) => ({
          ...r,
          login_email: r.user_id ? emailById.get(String(r.user_id)) || "" : "",
        }));
      }
      return { rows, total: rows.length, page: 1, pageSize: rows.length || pageSize };
    }

    const df = DATE_FIELD[payload.tab];
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase.from(table).select("*", { count: "exact" });
    query = applyTf(query, df, payload.tf);
    if (payload.q?.trim()) {
      query = applySearch(query, payload.tab, payload.q);
    }
    // Newest date first; same day → newest created_at (time); then id.
    if (df) {
      query = query
        .order(df, { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
    }
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) return { rows: [], total: 0, page, pageSize, error: error.message };

    let rows = (data || []) as Rec[];
    rows = await enrichPipelineRows(payload.tab, rows, supabase, admin, "list");

    return { rows, total: count ?? rows.length, page, pageSize };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      page,
      pageSize,
      error: e instanceof Error ? e.message : "Failed to load.",
    };
  }
}

/** Load one pipeline row by lead_id (deep-link / jumpTo when not on current page). */
export async function fetchRowByLeadId(payload: {
  tab: TabKey;
  leadId: string;
}): Promise<{ row: Rec | null; error?: string }> {
  try {
    await requireAuth();
    if (payload.tab === "teamsetup") return { row: null, error: "Not a pipeline tab." };
    const table = TAB_TABLE[payload.tab];
    if (!table) return { row: null, error: "Unknown tab." };

    const supabase = await createClient();
    const admin = createAdminClient();
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("lead_id", payload.leadId)
      .maybeSingle();
    if (error) return { row: null, error: error.message };
    if (!data) return { row: null };

    const [enriched] = await enrichPipelineRows(payload.tab, [data as Rec], supabase, admin);
    return { row: enriched || null };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : "Failed to load." };
  }
}

/** Global OPS accuracy stats for the banner (not limited to current page). */
export async function fetchOpsAccuracyStats(payload: { tf: Timeframe }): Promise<{
  reviewed: number;
  passes: number;
  fails: number;
  acc: number | null;
  met: boolean;
  error?: string;
}> {
  try {
    await requireAuth();
    const supabase = await createClient();
    let q = supabase
      .from("ops_verifications")
      .select("accuracy_review")
      .in("accuracy_review", ["Pass", "Fail"]);
    q = applyTf(q, DATE_FIELD.ops, payload.tf);
    const { data, error } = await q;
    if (error) {
      return { reviewed: 0, passes: 0, fails: 0, acc: null, met: true, error: error.message };
    }
    const reviewed = (data || []).length;
    const passes = (data || []).filter((r) => r.accuracy_review === "Pass").length;
    const fails = reviewed - passes;
    const acc = reviewed ? Math.round((passes / reviewed) * 1000) / 10 : null;
    const met = acc === null || acc >= 95;
    return { reviewed, passes, fails, acc, met };
  } catch (e) {
    return {
      reviewed: 0,
      passes: 0,
      fails: 0,
      acc: null,
      met: true,
      error: e instanceof Error ? e.message : "Failed to load.",
    };
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
    ["closer", "closer_deals"], ["documentation", "documentation_reviews"],
    ["ops", "ops_verifications"], ["msp", "msp_onboarding"],
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

    // Closer: Driving License + Voided Cheque before Docs Received / Closed
    if (payload.tab === "closer") {
      const stage = String(values.stage ?? payload.values.stage ?? "");
      if (stage === "Docs Received" || stage === "Closed" || stage === "Closed Won") {
        const leadId = String(payload.values.lead_id || "");
        if (!leadId) return { error: "Lead ID required." };
        const { data: docs } = await supabase
          .from("attachments")
          .select("doc_type")
          .eq("lead_id", leadId)
          .eq("stage", "closer")
          .in("doc_type", ["driving_license", "voided_cheque"]);
        const types = new Set((docs || []).map((d) => d.doc_type));
        if (!types.has("driving_license") || !types.has("voided_cheque")) {
          return {
            error:
              "Driving License and Voided Cheque are required before Docs Received or Closed.",
          };
        }
      }
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
      messages.push(
        `${biz} disqualified by QA. Returned to Lead Gen for a possible dispute.`
      );
    if (payload.tab === "sqlassign" && v.sql_status === "Assigned" && v.assigned_closer)
      messages.push(`${biz} assigned to ${v.assigned_closer}. Progressed to Closer Pipeline.`);
    if (payload.tab === "closer" && (v.stage === "Closed" || v.stage === "Closed Won"))
      messages.push(`${biz} closed. Progressed to Documentation.`);
    if (payload.tab === "closer" && v.stage === "Closed Lost")
      messages.push(`${biz} closed lost. Recorded and kept in history.`);
    if (payload.tab === "closer" && v.stage === "Not Interested")
      messages.push(`${biz} marked not interested. Recorded and kept in history.`);
    if (payload.tab === "documentation" && v.decision === "Pass")
      messages.push(`${biz} documentation passed. Progressed to OPS.`);
    if (payload.tab === "documentation" && v.decision === "Fail")
      messages.push(`${biz} documentation failed. Returned to Closer (Docs Pending).`);
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

    const leadId = String(payload.values.lead_id || payload.values.id || "");
    await logActivity({
      action: payload.id ? "record.update" : "record.create",
      entityTab: payload.tab,
      entityId: leadId || payload.id || null,
      summary: payload.id
        ? `Updated ${payload.tab} · ${biz}`
        : `Created ${payload.tab} · ${biz}`,
      meta: { fields: Object.keys(values) },
    });
    if (payload.newComment?.trim()) {
      await logActivity({
        action: "comment.add",
        entityTab: payload.tab,
        entityId: leadId || null,
        summary: `Comment on ${payload.tab} · ${biz}`,
      });
    }

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

    await logActivity({
      action: "record.create",
      entityTab: "ops",
      entityId: lead.lead_id,
      summary: `Manual OPS record · ${lead.lead_id} · ${String(v.business_name || "")}`,
    });

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
    await logActivity({
      action: "comment.add",
      entityTab: null,
      entityId: leadId,
      summary: `Comment on ${leadId}`,
    });
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
    await logActivity({
      action: "record.delete",
      entityTab: payload.tab,
      entityId: payload.id,
      summary: `Deleted ${payload.tab} record`,
    });
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
