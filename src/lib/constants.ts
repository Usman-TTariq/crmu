// Domain constants ported from the prototype.
// Person-specific demo roles are generalized into role templates (role_key on profiles).

/** Lead Gen create / edit — data sources. */
export const LEAD_SOURCES = [
  "Cold Calling",
  "Data Scrapping",
  "SEO",
  "PPC",
  "SMM",
];

export const isLiveTransferSource = (source: unknown) => {
  const s = String(source || "").trim();
  return s === "Live Transfer" || s === "SQL - LT";
};

/** Closer Pipeline — how the deal entered Closer. */
export const CLOSER_LEAD_SOURCES = [
  "SQL",
  "SQL - LT",
  "Self Generated",
  "Referral",
  "Upsell",
];

export const BUSINESS_TYPES = [
  "LLC",
  "Sole Proprietorship",
  "Corporation",
  "Partnership",
  "Non-Profit",
  "Other",
];

export const PROCESSING_TYPES = [
  "Surcharge",
  "Interchange",
  "Dual Pricing",
  "Flat Rate",
  "Cash Discount",
];

export const LEASE_TERMS = ["48mo", "36mo", "24mo", "12mo", "Other"];
export const PROCESSORS = ["Square", "Toast", "Clover", "Stripe", "NRS", "Cash only", "None", "Other"];
export const MSP_PROVIDERS = [
  "CardConnect/Soiree", "CardConnect/Genesys", "CardConnect/Meta", "Paysafe", "Nexio",
  "Argyle", "NRS", "USA Merchant", "Allapay", "Payroc", "Swipe4free", "Shift4", "NAB",
];
export const LEASING_COS = ["ELG", "FDGL", "PEAC", "ClickLease", "Marlin", "Other"];
export const ONB_BRANDS = ["Soiree INC", "Prisma Tech", "Genesys"];
export const ONB_FINAL = ["Pending", "Approved", "Archived"];
export const CS_STATUS = ["Active", "At Risk", "Closed by MSP", "On Hold", "Retained", "Churned", "Chargeback", "Cancelled"];
export const YN = ["Yes", "No"];
export const CLOSER_STAGES = [
  "No Answer",
  "Follow Up",
  "Docs Pending",
  "Docs Received",
  "Closed",
  "Closed Lost",
  "Not Interested",
];
export const FULFILLMENT_STAGES = ["Pending", "Equipment Shipped", "Installed", "Live"];
export const OPS_STATUS = ["Pending", "Approved", "Disapproved", "Rework"];
export const QA_DECISIONS = ["Pending", "Qualified", "Disqualified"];
export const SALE_TYPES = ["Lease", "Rental", "Free Rental"];
export const SQL_STATUS = ["Pending", "Assigned"];
export const FUNDING_STATUS = ["Pending", "Submitted", "Funded", "Declined"];
export const DEPTS = ["SALES", "OPS", "DOCUMENTATION", "ALL"];
export const DOC_DECISIONS = ["Pending", "Pass", "Fail"];

export type TabKey =
  | "ceo" | "monitor" | "counselling" | "logs" | "leadgen" | "qa" | "sqlassign" | "closer" | "saleskpi"
  | "documentation"
  | "ops" | "msp" | "fulfillment" | "leasing" | "retention" | "opskpi"
  | "teamsetup";

export const PIPE: [TabKey, string][] = [
  ["leadgen", "Lead"], ["qa", "QA"], ["sqlassign", "SQL"], ["closer", "Closer"],
  ["documentation", "Docs"],
  ["ops", "OPS QA"], ["msp", "Onboard"], ["fulfillment", "Fulfill"], ["leasing", "Lease"], ["retention", "CS"],
];

export const NAV_GROUPS: { label: string; keys: TabKey[] }[] = [
  { label: "Overview", keys: ["ceo", "monitor", "counselling", "logs"] },
  { label: "Sales", keys: ["leadgen", "qa", "sqlassign", "closer", "saleskpi"] },
  { label: "Documentation", keys: ["documentation"] },
  { label: "Operations", keys: ["ops", "msp", "fulfillment", "leasing", "retention", "opskpi"] },
  { label: "Admin", keys: ["teamsetup"] },
];

export const groupOf = (k: TabKey): string =>
  (NAV_GROUPS.find((g) => g.keys.includes(k)) || { label: "" }).label;

export interface TabDef {
  k: TabKey;
  label: string;
  emoji: string;
  kind?: "dashboard" | "kpi";
  div: "ALL" | "SALES" | "OPS" | "DOCUMENTATION";
  dated?: boolean;
  singular?: string;
  note?: string;
}

export const TABS: TabDef[] = [
  { k: "ceo", label: "CEO Dashboard", emoji: "\u{1F4CA}", kind: "dashboard", div: "ALL" },
  { k: "monitor", label: "Employee Monitor", emoji: "\u{1F440}", kind: "dashboard", div: "ALL", note: "Logged in, declared breaks (general/meal), Away after 2 min idle, Logged out." },
  { k: "counselling", label: "Performance Overview", emoji: "\u{1F4C8}", kind: "dashboard", div: "ALL", note: "Team sales + attendance overview, plus Day-1 → today journey for any person (output charts and presence timeline)." },
  { k: "logs", label: "Activity Logs", emoji: "\u{1F4DC}", kind: "dashboard", div: "ALL", note: "Audit trail of CRM actions. Visible to CEO and Super Admin only. CEO account actions are not recorded." },
  { k: "leadgen", label: "Lead Gen", emoji: "\u{1F4DD}", div: "SALES", dated: true, singular: "Lead", note: "Saving a lead instantly creates its QA record. After create, fields stay locked — you can still add Notes (visible to QA) and comments, and dispute a Disqualified lead." },
  { k: "qa", label: "QA", emoji: "\u2705", div: "SALES", dated: true, note: "Qualify when the 5 Yes/No checks are Yes. Monthly volume is informational only — under or over $5k does not block Qualify or Disqualify. Qualifying creates the SQL. Disqualifying returns the lead to Lead Gen for a possible dispute." },
  { k: "sqlassign", label: "SQL Assignment", emoji: "\u{1F3AF}", div: "SALES", dated: true, note: "Pick a closer (load shown) and set Status to Assigned to push it to the Closer Pipeline." },
  { k: "closer", label: "Closer Pipeline", emoji: "\u{1F91D}", div: "SALES", dated: true, singular: "Lead", note: "Add Lead creates a closer-direct deal (skips Lead Gen / QA / SQL). Intake fields (*) are required only when Stage is Closed. Closed sends it to Documentation. Closed Lost needs a reason and stays in history. Not Interested closes the deal without Documentation/OPS. Docs Received / Closed still need Driving License + Voided Cheque." },
  { k: "saleskpi", label: "Sales KPIs", emoji: "\u{1F4C8}", kind: "kpi", div: "SALES" },
  { k: "documentation", label: "Documentation", emoji: "\u{1F4C1}", div: "DOCUMENTATION", dated: true, singular: "Review", note: "Project Manager reviews closer docs. Pass sends the deal to OPS QA. Fail returns it to Closer as Docs Pending. Rows highlighted after OPS Rework show OPS reasoning — Fail sends those back to Closer." },
  { k: "ops", label: "OPS QA", emoji: "\u{1F50E}", div: "OPS", dated: true, singular: "Lead", note: "Add Lead creates an OPS-manual lead (skips Lead Gen / QA / SQL / Closer / Docs) assigned to an OPS QA agent. OPS QA verifies documents and records a reasoning for every decision. Only DL Recd and Voided Cheque must be Yes to approve — Bank Stmt, owner, and business checks are optional. Approved sends it to Onboarding. Rework returns the deal to Documentation with your reasoning." },
  { k: "msp", label: "Onboarding", emoji: "\u{1F6E0}\uFE0F", div: "OPS", dated: true, note: "Up to 3 MSP attempts, each Yes or No. Any Yes makes Final Status Approved and moves it to Fulfillment. All No keeps it Pending (never auto-rejected). Use Archived to close it out. A 2nd or 3rd attempt later than 24h after a failure is a fatal error and turns the row red." },
  { k: "fulfillment", label: "Fulfillment", emoji: "\u{1F4E6}", div: "OPS", dated: true, note: "Deploy equipment and set the merchant live." },
  { k: "leasing", label: "Leasing", emoji: "\u{1F4C4}", div: "OPS", dated: true, note: "Funding Status Funded opens a Customer Success record." },
  { k: "retention", label: "Customer Success", emoji: "\u{1F497}", div: "OPS", note: "Live merchants for follow-up. Comments are an append-only log stamped with name and time; merchants that churn or cancel are tracked here and on the dashboard." },
  { k: "opskpi", label: "OPS KPIs", emoji: "\u{1F4C8}", kind: "kpi", div: "OPS" },
  { k: "teamsetup", label: "Team Setup", emoji: "\u2699\uFE0F", div: "SALES", note: "Roster and live closer workload. Team Captain is a label only — pick any title (Closer, Supervisor, …) and mark Captain for that team." },
];

export const SALES_TABS: TabKey[] = ["leadgen", "qa", "sqlassign", "closer", "saleskpi", "teamsetup"];
export const OPS_TABS: TabKey[] = ["ops", "msp", "fulfillment", "leasing", "retention", "opskpi"];

// ---------------------------------------------------------------------------
// Role templates (generic — assigned per profile via role_key)
// ---------------------------------------------------------------------------

export type RowScope =
  | "ownLeadGen" | "ownQA" | "ownCloser" | "ownOps" | "ownOnb" | "ownRet" | "teamSQL";

export interface RoleDef {
  key: string;
  label: string;
  view: "all" | "sales" | "ops" | TabKey[];
  edit: "all" | "sales" | "ops" | TabKey[];
  home: TabKey;
  row?: Partial<Record<TabKey, RowScope>>;
  scope: string;
}

export const ROLES: RoleDef[] = [
  { key: "ceo", label: "CEO - Super Admin [ALL]", view: "all", edit: "all", home: "ceo", scope: "Full access. Sees and edits every department and the CEO dashboard." },
  { key: "super_admin", label: "Super Admin [ALL]", view: "all", edit: "all", home: "ceo", scope: "Full access. Sees and edits every department and the CEO dashboard." },
  { key: "sales_head", label: "Sales Head & QA [SALES]", view: "all", edit: "sales", home: "leadgen", scope: "Sees all data, edits only the Sales side. OPS tabs are read-only. Employee Monitor shows Lead Gen, Closers, and SQL (floor) logins. No CEO dashboard." },
  {
    key: "avp_sales",
    label: "AVP Sales [SALES]",
    view: [...SALES_TABS, "documentation"],
    edit: "sales",
    home: "leadgen",
    scope: "Full access to every Sales tab (Lead Gen through Team Setup). Documentation is view-only. Reviews closer OPS disputes — approve returns the deal to OPS QA.",
  },
  { key: "floor_manager", label: "Floor Manager [SALES]", view: ["leadgen", "qa", "sqlassign"], edit: [], home: "sqlassign", scope: "View only: Lead Gen, QA, and every SQL across all teams. Cannot assign or edit — only Sales Head and AVP Sales can assign." },
  {
    key: "finance",
    label: "Finance [VIEW]",
    view: [
      "leadgen",
      "qa",
      "sqlassign",
      "closer",
      "documentation",
      "ops",
      "msp",
      "fulfillment",
      "leasing",
      "retention",
    ],
    edit: [],
    home: "leadgen",
    scope: "View only: Lead Gen through Customer Success. Cannot edit or assign.",
  },
  {
    key: "hr",
    label: "HR [MONITOR]",
    view: ["monitor"],
    edit: [],
    home: "monitor",
    scope: "HR view: Employee Monitor with the same full company roster as CEO. No pipeline or other dashboards.",
  },
  {
    key: "project_manager",
    label: "Project Manager [DOCUMENTATION]",
    view: ["documentation"],
    edit: ["documentation"],
    home: "documentation",
    scope: "Reviews closer documents. Pass → OPS QA; Fail → Closer Docs Pending. Handles OPS Rework returns (highlighted).",
  },
  {
    key: "ops_manager",
    label: "Manager [OPS]",
    view: [...OPS_TABS, "leadgen", "closer", "documentation", "monitor"],
    edit: "ops",
    home: "ops",
    scope: "Manager. Edits and assigns every lead and OPS QA record across OPS, runs QA accuracy audit, and monitors OPS employee presence. Lead Gen, Closer, and Documentation are view-only from the journey.",
  },
  {
    key: "ops_am",
    label: "Assistant Manager [OPS]",
    view: [...OPS_TABS, "leadgen", "closer", "documentation"],
    edit: "ops",
    home: "ops",
    scope: "Assistant Manager. Edits and assigns every lead and OPS QA record across OPS, and can run the QA accuracy audit. Lead Gen, Closer, and Documentation are view-only from the journey.",
  },
  {
    key: "lg_agent",
    label: "Lead Gen Agent [SALES]",
    view: ["leadgen"],
    edit: ["leadgen"],
    home: "leadgen",
    row: { leadgen: "ownLeadGen" },
    scope: "Create new leads and view your own. After create, fields are locked — you can only add comments. Disqualified leads can be disputed to your supervisor.",
  },
  {
    key: "lg_sup",
    label: "Lead Gen Supervisor [SALES]",
    view: ["leadgen"],
    edit: [],
    home: "leadgen",
    scope: "View team leads. Approve or disapprove Lead Gen disputes on disqualified leads.",
  },
  {
    key: "qa_agent",
    label: "QA Agent [SALES]",
    view: ["qa", "closer"],
    edit: ["qa"],
    home: "qa",
    row: { qa: "ownQA" },
    scope: "Only the leads assigned to you for QA. Closer Pipeline is read-only so you can monitor SQLs that are not yet converted.",
  },
  { key: "closer", label: "Closer [SALES]", view: ["closer"], edit: ["closer"], home: "closer", row: { closer: "ownCloser" }, scope: "Only the deals assigned to you. You can also create direct leads that skip Lead Gen / QA and enter your pipeline. OPS-disapproved deals can be disputed to AVP Sales." },
  {
    key: "ops_verifier",
    label: "QA & Funding Lead [OPS]",
    view: ["ops", "leadgen", "closer", "documentation"],
    edit: ["ops"],
    home: "ops",
    scope: "Leads OPS QA. Sees, edits, assigns and revokes all OPS verification. Lead Gen, Closer, and Documentation are view-only from the journey.",
  },
  {
    key: "ops_qa_onb",
    label: "OPS QA & Onboarding [OPS]",
    view: [...OPS_TABS, "leadgen", "closer", "documentation"],
    edit: ["ops", "msp", "leasing"],
    home: "ops",
    scope: "Edits OPS QA, Onboarding, and Leasing across all rows. Lead Gen, Closer, and Documentation are view-only from the journey. Fulfillment, Customer Success, and OPS KPIs are view-only.",
  },
  {
    key: "ops_qa_agent",
    label: "Quality Assurance [OPS]",
    view: ["ops", "leadgen", "closer", "documentation"],
    edit: ["ops"],
    home: "ops",
    row: { ops: "ownOps" },
    scope: "Only the OPS leads assigned to you for verification. Lead Gen, Closer, and Documentation are view-only from the journey for those leads.",
  },
  { key: "onboarding_lead", label: "Onboarding Lead [OPS]", view: ["msp", "fulfillment", "leasing"], edit: ["msp", "fulfillment", "leasing"], home: "msp", scope: "Leads onboarding. Edits and assigns the whole team's submissions, plus Fulfillment and Leasing." },
  { key: "onb_agent", label: "Onboarding Agent [OPS]", view: ["msp"], edit: ["msp"], home: "msp", row: { msp: "ownOnb" }, scope: "End-to-end ownership: only the submissions assigned to you, and only you chase them." },
  { key: "cs_head", label: "Customer Success Head [OPS]", view: ["retention"], edit: ["retention"], home: "retention", scope: "Heads Customer Success. Edits the whole team." },
  { key: "cs_lead", label: "Customer Success Lead [OPS]", view: ["retention"], edit: ["retention"], home: "retention", scope: "All customer success cases. Assigns to agents." },
  { key: "cs_agent", label: "Customer Success Agent [OPS]", view: ["retention"], edit: ["retention"], home: "retention", row: { retention: "ownRet" }, scope: "Only cases where you are the agent or the substitute. Unassigned cases stay with CS Head / Lead until assigned." },
];

/** Legacy keys still in DB map onto the current role definition. */
const ROLE_ALIASES: Record<string, string> = {
  hr_monitor: "hr",
};

export const roleByKey = (key: string): RoleDef => {
  const resolved = ROLE_ALIASES[key] || key;
  return ROLES.find((r) => r.key === resolved) || ROLES.find((r) => r.key === "lg_agent")!;
};

export const resolveTabs = (spec: RoleDef["view"]): TabKey[] =>
  spec === "all" ? TABS.map((t) => t.k)
    : spec === "sales" ? SALES_TABS
    : spec === "ops" ? OPS_TABS
    : Array.isArray(spec) ? spec : [];

export const CEO_ROLES = ["ceo", "super_admin"];
export const MGR_ROLES = ["ceo", "super_admin", "ops_manager", "ops_am"];
/** Only these login emails may delete pipeline records (leads / stage rows). */
export const RECORD_DELETE_EMAILS = ["yasal.khan@tgtnexus.net"];
export const ADDABLE: TabKey[] = ["leadgen", "closer", "ops", "teamsetup"];
export const USER_ADMIN_ROLES = ["ceo", "super_admin"];
/** Employee Monitor tab + presence RPCs (scoped board for sales_head / ops_manager). */
export const MONITOR_ROLES = ["ceo", "super_admin", "sales_head", "ops_manager", "hr", "hr_monitor"];
/** Performance Overview — CEO / Super Admin / Sales Head only (not ops_manager). */
export const COUNSELLING_ROLES = ["ceo", "super_admin", "sales_head"];
/** When true, nav shows lock and nobody can open Performance Overview. */
export const COUNSELLING_LOCKED = false;

// Owner field per row scope (matches profile full name stored on records)
export const OWNER_FIELD: Record<RowScope, string> = {
  ownLeadGen: "lead_gen_agent",
  ownQA: "qa_agent",
  ownCloser: "closer",
  ownOps: "ops_agent",
  ownOnb: "onboarding_sp",
  ownRet: "agent_name",
  teamSQL: "",
};

// ---------------------------------------------------------------------------
// Titles (used in Team Setup + seed)
// ---------------------------------------------------------------------------

export const TITLE_ROLE_MAP: Record<string, string> = {
  CEO: "ceo",
  "Super Admin": "super_admin",
  "Sales Head & QA": "sales_head",
  "Head of Workforce Performance and Quality": "sales_head",
  "AVP Sales": "avp_sales",
  "Floor Manager": "floor_manager",
  Finance: "finance",
  HR: "hr",
  "Employee Monitor": "hr",
  "Workforce Monitor": "hr",
  "Project Manager": "project_manager",
  "Lead Gen Supervisor": "lg_sup",
  "Lead Gen Agent": "lg_agent",
  Closer: "closer",
  "Tier 3": "closer",
  "QA Agent": "qa_agent",
  Manager: "ops_manager",
  "Assistant Manager": "ops_am",
  "Onboarding Lead": "onboarding_lead",
  "Onboarding Agent": "onb_agent",
  "Customer Success Head": "cs_head",
  "Customer Success Lead": "cs_lead",
  "Customer Success Agent": "cs_agent",
  "QA & Funding Lead": "ops_verifier",
  "OPS QA & Onboarding": "ops_qa_onb",
  "Quality Assurance": "ops_qa_agent",
};

export const SALES_TEAMS = ["Olympus", "Phoenix", "Spartan", "Titans"];
