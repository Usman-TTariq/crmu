// Field configurations per tab, ported from the prototype's SCHEMAS.
// Keys are snake_case DB columns. Computed fields either derive from the row
// (client) or are enriched server-side by the fetch actions.

import {
  LEAD_SOURCES, CLOSER_LEAD_SOURCES, BUSINESS_TYPES, PROCESSING_TYPES, LEASE_TERMS,
  PROCESSORS, MSP_PROVIDERS, LEASING_COS, ONB_BRANDS,
  ONB_FINAL, CS_STATUS, YN, CLOSER_STAGES, FULFILLMENT_STAGES, OPS_STATUS,
  DOC_DECISIONS, QA_DECISIONS, SQL_STATUS, FUNDING_STATUS, DEPTS, SALES_TEAMS,
  TITLE_ROLE_MAP, roleByKey, type TabKey,
} from "@/lib/constants";

const TITLES = Object.keys(TITLE_ROLE_MAP);
import { num, isBlank } from "@/lib/format";
import type { Rec } from "@/lib/types";
import {
  cityOptionsForState,
  usStateCodes,
  usStateLabel,
  zipOptionsForCity,
} from "@/lib/us-locations";

export interface OptsCtx {
  leadgenAgents: string[];
  qaAgents: string[];
  closers: string[];
  opsVerifiers: string[];
  onboarders: string[];
  csAgents: string[];
  assigners: string[];
  projectManagers: string[];
}

export interface FieldDef {
  k: string;
  label: string;
  type: "text" | "date" | "num" | "select" | "computed" | "thread" | "files" | "phone" | "address";
  opts?: string[] | ((ctx: OptsCtx, record?: Rec) => string[]);
  /** Optional display label for select option values */
  optLabel?: (value: string) => string;
  /** Select is a combobox: pick from list and/or type freely */
  editable?: boolean;
  /** Disable this select until the named record field is non-empty */
  requires?: string;
  readOnly?: boolean;
  mono?: boolean;
  long?: boolean;
  hideTable?: boolean;
  isPill?: boolean;
  fmt?: "money" | "pct" | "num" | "stamp";
  managerOnly?: boolean;
  compute?: (r: Rec) => unknown;
  /** Shown in read-only fields when value is blank (e.g. Docs: Closer left empty) */
  emptyHint?: string;
  /** Show * and block save when blank (Closer intake / create) */
  required?: boolean;
}

/** Closer Pipeline fields required only when Stage is Closed (or Closed Won). */
export const CLOSER_REQUIRED_FIELDS: { k: string; label: string }[] = [
  { k: "closer_lead_source", label: "Lead Source" },
  { k: "assigned_date", label: "Assigned Date" },
  { k: "closer", label: "Closer (owner)" },
  { k: "stage", label: "Stage" },
  { k: "business_name", label: "Legal Business Name" },
  { k: "dba_name", label: "DBA - Business Name" },
  { k: "business_type", label: "Business Type" },
  { k: "business_category", label: "Business Category" },
  { k: "first_name", label: "First Name" },
  { k: "last_name", label: "Last Name" },
  { k: "phone", label: "Phone Number" },
  { k: "mobile_phone", label: "Mobile Phone Number" },
  { k: "email", label: "Email" },
  { k: "monthly_volume", label: "Monthly Volume ($)" },
  { k: "avg_ticket_size", label: "Average Ticket Size" },
  { k: "highest_ticket_size", label: "Highest Ticket Size" },
  { k: "tin_ein", label: "TIN/EIN" },
  { k: "ssn", label: "Social Sec #" },
  { k: "processing_type", label: "Processing Type" },
  { k: "processing_rate", label: "Processing Rate (% + Per Transaction)" },
  { k: "provider", label: "Provider" },
  { k: "equipment", label: "Equipment (With per equipment price)" },
  { k: "lease_amount", label: "Lease Amount" },
  { k: "lease_term", label: "Term (48mo/36mo)" },
  { k: "business_address", label: "Business Address" },
  { k: "state", label: "State" },
  { k: "city", label: "City" },
  { k: "zip_code", label: "Zip Code" },
  { k: "shipping_address", label: "Shipping Address" },
  { k: "residential_address", label: "Residential Address" },
  { k: "notes", label: "Notes" },
];

export const isCloserClosedStage = (stage: unknown): boolean => {
  const s = String(stage || "").trim();
  return s === "Closed" || s === "Closed Won";
};

export const closerRequiredKeys = new Set(CLOSER_REQUIRED_FIELDS.map((f) => f.k));
/** Schema helper — asterisks are applied in Drawer when stage is Closed. */
const markCloserRequired = (fields: FieldDef[]): FieldDef[] => fields;

// SLA fatal check, ported from onbFatal (real dates)
export const mspIsFatal = (r: Rec): boolean => {
  if (r.final_status === "Approved" || r.final_status === "Archived") return false;
  const now = Date.now();
  const day = 86400000;
  const d = (s: unknown) => new Date(String(s).slice(0, 10)).getTime();
  const gap = (a: unknown, b: unknown) =>
    isBlank(a) || isBlank(b) ? null : Math.round((d(b) - d(a)) / day);

  if (r.a1_result === "No") {
    if (isBlank(r.a2_result)) {
      if (!isBlank(r.a1_date) && (now - d(r.a1_date)) / day > 1) return true;
    } else {
      const g = gap(r.a1_date, r.a2_date);
      if (g !== null && g > 1) return true;
    }
  }
  if (r.a2_result === "No") {
    if (isBlank(r.a3_result)) {
      if (!isBlank(r.a2_date) && (now - d(r.a2_date)) / day > 1) return true;
    } else {
      const g = gap(r.a2_date, r.a3_date);
      if (g !== null && g > 1) return true;
    }
  }
  return false;
};

export const SCHEMAS: Record<string, FieldDef[]> = {
  leadgen: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    {
      k: "duplicate_mark",
      label: "Duplicate",
      type: "computed",
      isPill: true,
      compute: (r) => (r.duplicate_of ? `Duplicate · ${r.duplicate_of}` : ""),
    },
    { k: "created_at", label: "Created At", type: "computed", mono: true, fmt: "stamp", compute: (r) => r.created_at },
    { k: "date_created", label: "Date Created", type: "date", hideTable: true },
    { k: "updated_at", label: "Last Edited", type: "computed", mono: true, fmt: "stamp", compute: (r) => r.updated_at },
    { k: "updated_by_name", label: "Edited By", type: "computed", isPill: true, compute: (r) => r.updated_by_name || "-" },
    { k: "created_by_name", label: "Created By", type: "computed", isPill: true, compute: (r) => r.created_by_name || "-" },
    { k: "lead_gen_agent", label: "Lead Gen Agent", type: "select", opts: (c) => c.leadgenAgents },
    { k: "lead_source", label: "Data Source", type: "select", opts: LEAD_SOURCES },
    { k: "business_name", label: "Business Name", type: "text" },
    { k: "owner_name", label: "Owner Name", type: "text" },
    { k: "phone", label: "Phone", type: "phone", mono: true },
    { k: "email", label: "Email", type: "text" },
    { k: "business_address", label: "Business Address", type: "address" },
    {
      k: "state",
      label: "State",
      type: "select",
      editable: true,
      opts: () => usStateCodes(),
      optLabel: usStateLabel,
    },
    {
      k: "city",
      label: "City",
      type: "select",
      editable: true,
      requires: "state",
      opts: (_c, r) => cityOptionsForState(r?.state, r?.city),
    },
    {
      k: "zip_code",
      label: "Zip Code",
      type: "select",
      editable: true,
      requires: "city",
      opts: (_c, r) => zipOptionsForCity(r?.state, r?.city, r?.zip_code),
    },
    { k: "current_processor", label: "Current Processor", type: "select", opts: PROCESSORS },
    { k: "current_device", label: "Current Device", type: "text" },
    { k: "current_rate", label: "Current Rate %", type: "text" },
    { k: "monthly_volume", label: "Monthly Volume ($)", type: "num", fmt: "money" },
    { k: "qa_outcome", label: "QA Outcome", type: "computed", isPill: true, compute: (r) => r.qa_outcome ?? "Not in QA" },
    {
      k: "dispute_status_label",
      label: "Dispute",
      type: "computed",
      isPill: true,
      compute: (r) => {
        if (r.dispute_status === "open") return "Dispute open";
        if (r.dispute_status === "disapproved") return "Dispute disapproved";
        if (r.dispute_status === "approved") return "Dispute approved → QA";
        return "";
      },
    },
    {
      k: "notes",
      label: "Notes",
      type: "text",
      long: true,
      hideTable: true,
    },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ],
  qa: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "qa_date", label: "Date", type: "date" },
    { k: "lead_gen_agent", label: "Lead Gen Agent", type: "text", readOnly: true },
    { k: "lead_source", label: "Data Source", type: "select", opts: LEAD_SOURCES, readOnly: true },
    { k: "business_name", label: "Business Name", type: "text", readOnly: true },
    { k: "owner_name", label: "Owner Name", type: "text", readOnly: true },
    { k: "phone", label: "Phone", type: "phone", mono: true, readOnly: true },
    { k: "email", label: "Email", type: "text", readOnly: true },
    { k: "business_address", label: "Business Address", type: "address", readOnly: true },
    { k: "city", label: "City", type: "text", readOnly: true },
    { k: "zip_code", label: "Zip Code", type: "text", readOnly: true },
    { k: "state", label: "State", type: "text", readOnly: true },
    { k: "current_processor", label: "Current Processor", type: "select", opts: PROCESSORS, readOnly: true },
    { k: "current_device", label: "Current Device", type: "text", readOnly: true },
    { k: "current_rate", label: "Current Rate %", type: "text", readOnly: true },
    { k: "monthly_volume", label: "Monthly Volume ($)", type: "num", fmt: "money", readOnly: true },
    { k: "notes", label: "Lead Notes", type: "text", long: true, hideTable: true, readOnly: true },
    {
      k: "after_dispute",
      label: "Dispute return",
      type: "computed",
      isPill: true,
      compute: (r) => (r.returned_after_dispute || r.after_dispute ? "After dispute" : ""),
    },
    { k: "us_business", label: "US Business?", type: "select", opts: YN },
    { k: "owner_reached", label: "Owner Reached?", type: "select", opts: YN },
    { k: "interested", label: "Interested?", type: "select", opts: YN },
    { k: "physical_loc", label: "Physical Loc?", type: "select", opts: YN },
    { k: "not_restricted", label: "Not Restricted?", type: "select", opts: YN },
    {
      k: "vol_over_5k",
      label: "Vol > $5k? (info only)",
      type: "computed",
      isPill: true,
      compute: (r) => (num(r.monthly_volume) > 5000 ? "Yes" : "No"),
    },
    { k: "qa_agent", label: "QA Agent", type: "select", opts: (c) => c.qaAgents },
    { k: "qa_decision", label: "QA Decision", type: "select", opts: QA_DECISIONS },
    { k: "qa_notes", label: "QA Notes", type: "text", long: true, hideTable: true },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ],
  sqlassign: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "qa_date", label: "QA Date", type: "date", readOnly: true },
    { k: "business_name", label: "Business Name", type: "text", readOnly: true },
    { k: "owner_name", label: "Owner Name", type: "text", readOnly: true },
    { k: "phone", label: "Phone", type: "phone", mono: true, readOnly: true },
    { k: "state", label: "State", type: "text", readOnly: true },
    { k: "monthly_volume", label: "Monthly Volume ($)", type: "num", fmt: "money", readOnly: true },
    {
      k: "lead_gen_agent",
      label: "Lead Gen Agent",
      type: "computed",
      isPill: true,
      compute: (r) => r.lead_gen_agent || "-",
    },
    {
      k: "lead_gen_team",
      label: "Team",
      type: "computed",
      isPill: true,
      compute: (r) => r.lead_gen_team || "-",
    },
    { k: "closer_open_load", label: "Closer Open Load", type: "computed", fmt: "num", compute: (r) => r.closer_open_load ?? 0 },
    { k: "assigned_closer", label: "Assigned Closer", type: "select", opts: (c) => c.closers },
    { k: "assignment_date", label: "Assignment Date", type: "date", hideTable: true },
    {
      k: "assigned_at",
      label: "Assigned At",
      type: "computed",
      mono: true,
      fmt: "stamp",
      compute: (r) => r.assigned_at || (r.sql_status === "Assigned" ? r.updated_at : null),
    },
    { k: "assigned_by", label: "Assigned By", type: "select", opts: (c) => c.assigners },
    { k: "sql_status", label: "SQL Status", type: "select", opts: SQL_STATUS },
    { k: "notes", label: "Notes", type: "text", long: true, hideTable: true },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ],
  closer: markCloserRequired([
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "created_at", label: "Created At", type: "computed", mono: true, fmt: "stamp", compute: (r) => r.created_at },
    { k: "updated_at", label: "Last Edited", type: "computed", mono: true, fmt: "stamp", compute: (r) => r.updated_at },
    { k: "updated_by_name", label: "Edited By", type: "computed", isPill: true, compute: (r) => r.updated_by_name || "-" },
    { k: "created_by_name", label: "Created By", type: "computed", isPill: true, compute: (r) => r.created_by_name || "-" },
    {
      k: "lead_source",
      label: "Data Source",
      type: "select",
      opts: LEAD_SOURCES,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "closer_lead_source",
      label: "Lead Source",
      type: "select",
      opts: CLOSER_LEAD_SOURCES,
      hideTable: true,
    },
    { k: "assigned_date", label: "Assigned Date", type: "date" },
    { k: "closer", label: "Closer (owner)", type: "select", opts: (c) => c.closers, readOnly: true },
    { k: "stage", label: "Stage", type: "select", opts: CLOSER_STAGES },
    {
      k: "ops_outcome",
      label: "OPS QA",
      type: "computed",
      isPill: true,
      compute: (r) => {
        // Same statuses as OPS QA tab (Pending / Approved / Disapproved / Rework)
        if (r.ops_status === "Disapproved") return "Disapproved";
        if (r.ops_status === "Approved") return "Approved";
        if (r.ops_status === "Rework" || r.ops_status === "Reworked") return "Rework";
        if (r.ops_status === "Pending" && r.returned_after_ops_dispute) return "Pending (after dispute)";
        if (r.ops_status === "Pending") return "Pending";
        return "";
      },
    },
    {
      k: "ops_dispute_status_label",
      label: "OPS Dispute",
      type: "computed",
      isPill: true,
      hideTable: true,
      compute: (r) => {
        if (r.ops_dispute_status === "open") return "OPS dispute open";
        if (r.ops_dispute_status === "disapproved") return "OPS dispute disapproved";
        if (r.ops_dispute_status === "approved") return "OPS dispute approved → OPS";
        return "";
      },
    },
    { k: "lost_reason", label: "Lost Reason", type: "text", long: true, hideTable: true },
    { k: "connected_date", label: "Connected Date", type: "date" },
    { k: "docs_pending_date", label: "Docs Pending Date", type: "date" },
    { k: "docs_recd_date", label: "Docs Recd Date", type: "date" },
    { k: "closed_date", label: "Closed Date", type: "date" },
    {
      k: "lead_gen_agent",
      label: "Lead Gen Agent",
      type: "computed",
      isPill: true,
      compute: (r) => r.lead_gen_agent || "-",
    },
    {
      k: "lead_gen_team",
      label: "Team",
      type: "computed",
      isPill: true,
      compute: (r) => r.lead_gen_team || "-",
    },
    // --- Closer intake (HubSpot-style) ---
    { k: "business_name", label: "Legal Business Name", type: "text" },
    { k: "dba_name", label: "DBA - Business Name", type: "text", hideTable: true },
    { k: "business_type", label: "Business Type", type: "select", opts: BUSINESS_TYPES, hideTable: true },
    { k: "business_category", label: "Business Category", type: "text", hideTable: true },
    { k: "first_name", label: "First Name", type: "text", hideTable: true },
    { k: "last_name", label: "Last Name", type: "text", hideTable: true },
    {
      k: "owner_name",
      label: "Owner Name",
      type: "computed",
      isPill: true,
      compute: (r) => {
        const joined = [r.first_name, r.last_name].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
        return joined || r.owner_name || "-";
      },
    },
    { k: "phone", label: "Phone Number", type: "phone", mono: true },
    { k: "mobile_phone", label: "Mobile Phone Number", type: "phone", mono: true, hideTable: true },
    { k: "email", label: "Email", type: "text", hideTable: true },
    { k: "monthly_volume", label: "Monthly Volume ($)", type: "num", fmt: "money" },
    { k: "avg_ticket_size", label: "Average Ticket Size", type: "num", fmt: "money", hideTable: true },
    { k: "highest_ticket_size", label: "Highest Ticket Size", type: "num", fmt: "money", hideTable: true },
    { k: "tin_ein", label: "TIN/EIN", type: "text", mono: true, hideTable: true },
    { k: "ssn", label: "Social Sec #", type: "text", mono: true, hideTable: true },
    { k: "processing_type", label: "Processing Type", type: "select", opts: PROCESSING_TYPES, hideTable: true },
    {
      k: "processing_rate",
      label: "Processing Rate (% + Per Transaction)",
      type: "text",
      hideTable: true,
    },
    { k: "provider", label: "Provider", type: "text", hideTable: true },
    {
      k: "equipment",
      label: "Equipment (With per equipment price)",
      type: "text",
      long: true,
      hideTable: true,
    },
    { k: "lease_amount", label: "Lease Amount", type: "num", fmt: "money", hideTable: true },
    { k: "lease_term", label: "Term (48mo/36mo)", type: "select", opts: LEASE_TERMS, hideTable: true },
    { k: "business_address", label: "Business Address", type: "address", hideTable: true },
    {
      k: "state",
      label: "State",
      type: "select",
      editable: true,
      opts: () => usStateCodes(),
      optLabel: usStateLabel,
    },
    {
      k: "city",
      label: "City",
      type: "select",
      editable: true,
      requires: "state",
      opts: (_c, r) => cityOptionsForState(r?.state, r?.city),
      hideTable: true,
    },
    {
      k: "zip_code",
      label: "Zip Code",
      type: "select",
      editable: true,
      requires: "city",
      opts: (_c, r) => zipOptionsForCity(r?.state, r?.city, r?.zip_code),
      hideTable: true,
    },
    { k: "shipping_address", label: "Shipping Address", type: "text", long: true, hideTable: true },
    { k: "residential_address", label: "Residential Address", type: "text", long: true, hideTable: true },
    {
      k: "current_processor",
      label: "Lead Gen · Current Processor",
      type: "text",
      readOnly: true,
      hideTable: true,
    },
    {
      k: "current_device",
      label: "Lead Gen · Current Device",
      type: "text",
      readOnly: true,
      hideTable: true,
    },
    {
      k: "current_rate",
      label: "Lead Gen · Current Rate %",
      type: "text",
      readOnly: true,
      hideTable: true,
    },
    {
      k: "lead_notes",
      label: "Lead Gen Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "qa_notes_fwd",
      label: "QA Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "documentation_notes",
      label: "Documentation Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "ops_notes",
      label: "OPS Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "ops_reasoning_fwd",
      label: "OPS Reasoning",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "attachments",
      label: "Documents (DL + Voided Cheque required; Docs/OPS files carry forward)",
      type: "files",
      long: true,
      hideTable: true,
    },
    { k: "notes", label: "Notes", type: "text", long: true, hideTable: true },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ]),
  documentation: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "closed_date", label: "Closed Date", type: "date", readOnly: true },
    { k: "lead_source", label: "Data Source", type: "text", readOnly: true },
    { k: "closer", label: "Closer", type: "text", readOnly: true },
    {
      k: "lead_gen_agent",
      label: "Lead Gen Agent",
      type: "computed",
      isPill: true,
      compute: (r) => r.lead_gen_agent || "",
    },
    {
      k: "lead_gen_team",
      label: "Team",
      type: "computed",
      isPill: true,
      compute: (r) => r.lead_gen_team || "",
    },
    // Closer intake (read-only forward from Closer Pipeline)
    { k: "business_name", label: "Legal Business Name", type: "text", readOnly: true, emptyHint: "Empty — not filled by Closer" },
    { k: "dba_name", label: "DBA - Business Name", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "business_type", label: "Business Type", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "business_category", label: "Business Category", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "first_name", label: "First Name", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "last_name", label: "Last Name", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    {
      k: "owner_name",
      label: "Owner Name",
      type: "computed",
      isPill: true,
      emptyHint: "Empty — not filled by Closer",
      compute: (r) => {
        const joined = [r.first_name, r.last_name].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
        return joined || r.owner_name || "";
      },
    },
    { k: "phone", label: "Phone Number", type: "phone", mono: true, readOnly: true, emptyHint: "Empty — not filled by Closer" },
    { k: "mobile_phone", label: "Mobile Phone Number", type: "phone", mono: true, readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "email", label: "Email", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "monthly_volume", label: "Monthly Volume ($)", type: "num", fmt: "money", readOnly: true, emptyHint: "Empty — not filled by Closer" },
    { k: "avg_ticket_size", label: "Average Ticket Size", type: "num", fmt: "money", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "highest_ticket_size", label: "Highest Ticket Size", type: "num", fmt: "money", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "tin_ein", label: "TIN/EIN", type: "text", mono: true, readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "ssn", label: "Social Sec #", type: "text", mono: true, readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "processing_type", label: "Processing Type", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    {
      k: "processing_rate",
      label: "Processing Rate (% + Per Transaction)",
      type: "text",
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not filled by Closer",
    },
    { k: "provider", label: "Provider", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    {
      k: "equipment",
      label: "Equipment (With per equipment price)",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not filled by Closer",
    },
    { k: "lease_amount", label: "Lease Amount", type: "num", fmt: "money", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "lease_term", label: "Term (48mo/36mo)", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "business_address", label: "Business Address", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "state", label: "State", type: "text", readOnly: true, emptyHint: "Empty — not filled by Closer" },
    { k: "city", label: "City", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "zip_code", label: "Zip Code", type: "text", readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "shipping_address", label: "Shipping Address", type: "text", long: true, readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    { k: "residential_address", label: "Residential Address", type: "text", long: true, readOnly: true, hideTable: true, emptyHint: "Empty — not filled by Closer" },
    {
      k: "current_processor",
      label: "Lead Gen · Current Processor",
      type: "text",
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not provided by Lead Gen",
    },
    {
      k: "current_device",
      label: "Lead Gen · Current Device",
      type: "text",
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not provided by Lead Gen",
    },
    {
      k: "current_rate",
      label: "Lead Gen · Current Rate %",
      type: "text",
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not provided by Lead Gen",
    },
    {
      k: "lead_notes",
      label: "Lead Gen Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not provided by Lead Gen",
    },
    {
      k: "qa_notes_fwd",
      label: "QA Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not provided by QA",
    },
    // Documentation decision
    { k: "pm_name", label: "Project Manager", type: "select", opts: (c) => c.projectManagers },
    { k: "decision", label: "Decision", type: "select", opts: DOC_DECISIONS, isPill: true },
    {
      k: "after_ops_rework",
      label: "OPS return",
      type: "computed",
      isPill: true,
      compute: (r) => (r.returned_after_ops_rework ? "After OPS rework" : ""),
    },
    { k: "fail_reason", label: "Fail Reason", type: "text", long: true, hideTable: true },
    { k: "review_date", label: "Review Date", type: "date" },
    {
      k: "attachments",
      label: "Documents (Closer + OPS carried forward)",
      type: "files",
      long: true,
      hideTable: true,
    },
    {
      k: "closer_notes",
      label: "Closer Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not filled by Closer",
    },
    {
      k: "ops_rework_reasoning",
      label: "OPS Rework Reasoning",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — no OPS rework yet",
    },
    {
      k: "ops_notes",
      label: "OPS Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
      emptyHint: "Empty — not filled by OPS",
    },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
    { k: "notes", label: "Documentation Notes", type: "text", long: true, hideTable: true },
  ],
  ops: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "closed_date", label: "Closed Date", type: "date", readOnly: true },
    { k: "business_name", label: "Business Name", type: "text", readOnly: true },
    { k: "owner_name", label: "Owner Name", type: "text", readOnly: true },
    { k: "phone", label: "Phone", type: "phone", mono: true, readOnly: true },
    { k: "closer", label: "Closer", type: "text", readOnly: true },
    { k: "monthly_volume", label: "Monthly Volume ($)", type: "num", fmt: "money", readOnly: true },
    { k: "brand", label: "Brand", type: "select", opts: ONB_BRANDS },
    { k: "dl_recd", label: "DL Recd?", type: "select", opts: YN },
    { k: "voided_check", label: "Voided Cheque?", type: "select", opts: YN },
    { k: "bank_stmt", label: "Bank Stmt?", type: "select", opts: YN },
    { k: "owner_name_verified", label: "Owner Name Verified?", type: "select", opts: YN },
    { k: "owner_phone_verified", label: "Owner Phone Verified?", type: "select", opts: YN },
    { k: "business_verified", label: "Business Verified?", type: "select", opts: YN },
    { k: "ops_status", label: "Approval / Disapproval", type: "select", opts: OPS_STATUS },
    {
      k: "after_ops_dispute",
      label: "After dispute",
      type: "computed",
      isPill: true,
      compute: (r) => (r.returned_after_ops_dispute || r.after_ops_dispute ? "After OPS dispute" : ""),
    },
    { k: "reasoning", label: "Reasoning", type: "text", long: true },
    { k: "ops_agent", label: "OPS QA Agent", type: "select", opts: (c) => c.opsVerifiers },
    { k: "ops_date", label: "OPS Date", type: "date" },
    { k: "accuracy_review", label: "Accuracy Check", type: "select", opts: ["Pass", "Fail"], isPill: true, managerOnly: true },
    {
      k: "attachments",
      label: "Documents (Closer + Docs carried forward)",
      type: "files",
      long: true,
      hideTable: true,
    },
    {
      k: "lead_gen_notes",
      label: "Lead Gen Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "qa_notes_fwd",
      label: "QA Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "closer_notes",
      label: "Closer Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "documentation_rework_comments",
      label: "Documentation Rework Comments",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
    { k: "notes", label: "OPS Notes", type: "text", long: true, hideTable: true },
  ],
  msp: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "business_name", label: "Business Name", type: "text", readOnly: true },
    { k: "owner_name", label: "Owner Name", type: "text", readOnly: true },
    { k: "monthly_volume", label: "Monthly Volume ($)", type: "num", fmt: "money", readOnly: true },
    { k: "ops_approved_date", label: "OPS Approved Date", type: "date", readOnly: true },
    { k: "onboarding_sp", label: "Onboarding SP (owner)", type: "select", opts: (c) => c.onboarders },
    { k: "sla_status", label: "SLA Status", type: "computed", isPill: true, compute: (r) => (mspIsFatal(r) ? "Fatal Error" : "On Track") },
    { k: "a1_date", label: "1st Submission Date", type: "date" },
    { k: "a1_provider", label: "1st MSP", type: "select", opts: MSP_PROVIDERS },
    { k: "a1_result", label: "Attempt 1 Result", type: "select", opts: YN, isPill: true },
    { k: "a1_reason", label: "1st Reason", type: "text", hideTable: true },
    { k: "a2_date", label: "2nd Submission Date", type: "date" },
    { k: "a2_provider", label: "2nd MSP", type: "select", opts: MSP_PROVIDERS },
    { k: "a2_result", label: "Attempt 2 Result", type: "select", opts: YN, isPill: true },
    { k: "a2_reason", label: "2nd Reason", type: "text", hideTable: true },
    { k: "a3_date", label: "3rd Submission Date", type: "date" },
    { k: "a3_provider", label: "3rd MSP", type: "select", opts: MSP_PROVIDERS },
    { k: "a3_result", label: "Attempt 3 Result", type: "select", opts: YN, isPill: true },
    { k: "a3_reason", label: "3rd Reason", type: "text", hideTable: true },
    { k: "final_reasoning", label: "Final Reasoning", type: "text", long: true, hideTable: true },
    { k: "approved_date", label: "Approved Date", type: "date" },
    { k: "final_status", label: "Final Status", type: "select", opts: ONB_FINAL, isPill: true },
    { k: "equip_order_date", label: "Equipment Order Date", type: "date" },
    { k: "device", label: "Device", type: "text" },
    { k: "tracking_number", label: "Equipment Tracking #", type: "text", mono: true },
    { k: "delivery_date", label: "Equipment Delivery Date", type: "date" },
    { k: "shipping_cost", label: "Equipment/Shipping Cost", type: "num", fmt: "money" },
    {
      k: "attachments",
      label: "Documents (Closer + Docs + OPS carried forward)",
      type: "files",
      long: true,
      hideTable: true,
    },
    {
      k: "lead_gen_notes",
      label: "Lead Gen Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "qa_notes_fwd",
      label: "QA Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "closer_notes",
      label: "Closer Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "documentation_notes",
      label: "Documentation Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "documentation_rework_comments",
      label: "Documentation Rework Comments",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "ops_notes",
      label: "OPS Notes",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    {
      k: "ops_reasoning_fwd",
      label: "OPS Reasoning",
      type: "text",
      long: true,
      readOnly: true,
      hideTable: true,
    },
    { k: "notes", label: "Onboarding Notes", type: "text", long: true, hideTable: true },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ],
  fulfillment: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "funded_date", label: "Approved Date", type: "date", readOnly: true },
    { k: "business_name", label: "Business Name", type: "text", readOnly: true },
    { k: "owner_name", label: "Owner Name", type: "text", readOnly: true },
    { k: "fulfillment_stage", label: "Fulfillment Stage", type: "select", opts: FULFILLMENT_STAGES },
    { k: "hardware", label: "Hardware", type: "text" },
    { k: "serial", label: "Serial #", type: "text", mono: true },
    { k: "live_date", label: "Live Date", type: "date" },
    {
      k: "attachments",
      label: "Documents (Closer → Onboarding carried forward)",
      type: "files",
      long: true,
      hideTable: true,
    },
    { k: "notes", label: "Notes", type: "text", long: true, hideTable: true },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ],
  leasing: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "business_name", label: "Business Name", type: "text", readOnly: true },
    { k: "owner_name", label: "Owner Name", type: "text", readOnly: true },
    { k: "leasing_company", label: "Leasing Company", type: "select", opts: LEASING_COS },
    { k: "order_activation", label: "Order/Activation", type: "date" },
    { k: "monthly_lease", label: "Monthly Lease ($)", type: "num", fmt: "money" },
    { k: "approved_funding", label: "Approved Funding ($)", type: "num", fmt: "money" },
    { k: "shipping_cost", label: "Equipment/Shipping Cost", type: "num", fmt: "money" },
    { k: "funding_status", label: "Funding Status", type: "select", opts: FUNDING_STATUS },
    { k: "funding_date", label: "Funding Date", type: "date" },
    { k: "invoice_no", label: "Invoice No.", type: "text", mono: true },
    {
      k: "attachments",
      label: "Documents (Closer → Onboarding carried forward)",
      type: "files",
      long: true,
      hideTable: true,
    },
    { k: "notes", label: "Notes", type: "text", long: true, hideTable: true },
    { k: "lead_comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ],
  retention: [
    { k: "lead_id", label: "Lead ID", type: "text", readOnly: true, mono: true },
    { k: "business_name", label: "Business Name", type: "text", readOnly: true },
    { k: "team", label: "Team", type: "text" },
    { k: "agent_name", label: "Agent Name", type: "select", opts: (c) => c.csAgents },
    { k: "status", label: "Status", type: "select", opts: CS_STATUS },
    { k: "substitute", label: "Substitute Agent", type: "select", opts: (c) => c.csAgents },
    { k: "handover_notes", label: "Handover Notes (work to be done)", type: "text", long: true, hideTable: true },
    { k: "comments", label: "Comments (log)", type: "thread", long: true, hideTable: true },
  ],
  teamsetup: [
    { k: "full_name", label: "Name", type: "text" },
    { k: "title", label: "Title", type: "select", opts: TITLES },
    { k: "dept", label: "Dept", type: "select", opts: DEPTS },
    { k: "team", label: "Team", type: "select", opts: SALES_TEAMS },
    {
      k: "is_team_captain",
      label: "Team Captain",
      type: "select",
      opts: YN,
      hideTable: true,
      // Label only — does not change Access Role / permissions.
    },
    {
      k: "captain_label",
      label: "Captain",
      type: "computed",
      isPill: true,
      compute: (r) =>
        r.is_team_captain === true || r.is_team_captain === "Yes" ? "Captain" : "—",
    },
    // Access role is derived from the title (TITLE_ROLE_MAP) when saving.
    {
      k: "role_key", label: "Access Role", type: "computed", isPill: true, hideTable: true,
      compute: (r) => roleByKey(TITLE_ROLE_MAP[String(r.title || "")] || String(r.role_key || "")).label,
    },
    { k: "target", label: "Target", type: "text" },
    { k: "open_opps", label: "Open Opps", type: "computed", fmt: "num", compute: (r) => r.open_opps ?? 0 },
    { k: "closed_month", label: "Closed (Mo)", type: "computed", fmt: "num", compute: (r) => r.closed_month ?? 0 },
    { k: "login_state", label: "Login", type: "computed", isPill: true, compute: (r) => (r.user_id ? "Yes" : "Not created") },
    { k: "login_email", label: "Login Email", type: "text", readOnly: true, mono: true },
    { k: "active_state", label: "Status", type: "computed", isPill: true, compute: (r) => (r.is_active === false ? "Inactive" : "Active") },
    { k: "notes", label: "Notes", type: "text", long: true, hideTable: true },
  ],
};

// Editable DB columns per tab (whitelist used by the save actions)
export const EDITABLE_COLUMNS: Record<string, string[]> = {
  leadgen: [
    "date_created", "lead_gen_agent", "lead_source", "business_name", "owner_name",
    "phone", "email", "business_address", "city", "zip_code", "state",
    "current_processor", "current_device", "current_rate", "monthly_volume", "notes",
  ],
  qa: [
    "qa_date",
    "us_business", "owner_reached", "interested", "physical_loc", "not_restricted",
    "qa_agent", "qa_decision", "qa_notes",
  ],
  sqlassign: ["assigned_closer", "assignment_date", "assigned_by", "sql_status", "notes"],
  closer: [
    "closer_lead_source",
    "assigned_date", "stage", "lost_reason", "connected_date", "docs_pending_date",
    "docs_recd_date", "closed_date", "notes",
    "business_name", "dba_name", "business_type", "business_category",
    "first_name", "last_name", "owner_name", "phone", "mobile_phone", "email",
    "monthly_volume", "avg_ticket_size", "highest_ticket_size",
    "tin_ein", "ssn", "processing_type", "processing_rate", "provider", "equipment",
    "lease_amount", "lease_term",
    "business_address", "city", "zip_code", "state",
    "shipping_address", "residential_address",
  ],
  documentation: ["pm_name", "decision", "fail_reason", "review_date", "notes"],
  ops: [
    "brand", "dl_recd", "voided_check", "bank_stmt", "owner_name_verified",
    "owner_phone_verified", "business_verified", "ops_status", "reasoning",
    "ops_agent", "ops_date", "accuracy_review", "notes",
  ],
  msp: [
    "onboarding_sp", "a1_date", "a1_provider", "a1_result", "a1_reason",
    "a2_date", "a2_provider", "a2_result", "a2_reason",
    "a3_date", "a3_provider", "a3_result", "a3_reason",
    "final_reasoning", "approved_date", "final_status",
    "equip_order_date", "device", "tracking_number", "delivery_date",
    "shipping_cost", "notes",
  ],
  fulfillment: ["fulfillment_stage", "hardware", "serial", "live_date", "notes"],
  leasing: [
    "leasing_company", "order_activation", "monthly_lease", "approved_funding",
    "shipping_cost", "funding_status", "funding_date", "invoice_no", "notes",
  ],
  retention: ["team", "agent_name", "status", "substitute", "handover_notes"],
  teamsetup: ["full_name", "title", "dept", "team", "is_team_captain", "target", "role_key", "notes"],
};

export const TAB_TABLE: Record<string, string> = {
  leadgen: "leads",
  qa: "qa_records",
  sqlassign: "sql_assignments",
  closer: "closer_deals",
  documentation: "documentation_reviews",
  ops: "ops_verifications",
  msp: "msp_onboarding",
  fulfillment: "fulfillment",
  leasing: "leasing",
  retention: "retention",
  teamsetup: "profiles",
};

export const DATE_FIELD: Partial<Record<TabKey, string>> = {
  leadgen: "date_created",
  qa: "qa_date",
  sqlassign: "assignment_date",
  closer: "assigned_date",
  documentation: "review_date",
  ops: "ops_date",
  msp: "ops_approved_date",
  fulfillment: "funded_date",
  leasing: "order_activation",
};
