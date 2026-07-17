// Domain constants ported from the prototype.
// Person-specific demo roles are generalized into role templates (role_key on profiles).

export const LEAD_SOURCES = ["Cold Calling", "PPC", "Referral", "Data Scrap", "Organic", "Other"];
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
export const OPS_STATUS = ["Pending", "Approved", "Disapproved"];
export const QA_DECISIONS = ["Pending", "Qualified", "Disqualified"];
export const SQL_STATUS = ["Pending", "Assigned"];
export const FUNDING_STATUS = ["Pending", "Submitted", "Funded", "Declined"];
export const DEPTS = ["SALES", "OPS", "ALL"];

export type TabKey =
  | "ceo" | "monitor" | "leadgen" | "qa" | "sqlassign" | "closer" | "saleskpi"
  | "ops" | "msp" | "fulfillment" | "leasing" | "retention" | "opskpi"
  | "teamsetup";

export const PIPE: [TabKey, string][] = [
  ["leadgen", "Lead"], ["qa", "QA"], ["sqlassign", "SQL"], ["closer", "Closer"],
  ["ops", "OPS QA"], ["msp", "Onboard"], ["fulfillment", "Fulfill"], ["leasing", "Lease"], ["retention", "CS"],
];

export const NAV_GROUPS: { label: string; keys: TabKey[] }[] = [
  { label: "Overview", keys: ["ceo", "monitor"] },
  { label: "Sales", keys: ["leadgen", "qa", "sqlassign", "closer", "saleskpi"] },
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
  div: "ALL" | "SALES" | "OPS";
  dated?: boolean;
  singular?: string;
  note?: string;
}

export const TABS: TabDef[] = [
  { k: "ceo", label: "CEO Dashboard", emoji: "\u{1F4CA}", kind: "dashboard", div: "ALL" },
  { k: "monitor", label: "Employee Monitor", emoji: "\u{1F440}", kind: "dashboard", div: "ALL", note: "Live working / idle / away status from mouse, keyboard, and CRM tab activity." },
  { k: "leadgen", label: "Lead Gen", emoji: "\u{1F4DD}", div: "SALES", dated: true, singular: "Lead", note: "Saving a lead instantly creates its QA record. The QA Outcome column shows whether QA later qualified or rejected it." },
  { k: "qa", label: "QA", emoji: "\u2705", div: "SALES", dated: true, note: "Qualify only when the 6 checks are Yes and volume is over $5k. Qualifying creates the SQL. Disqualifying is recorded and kept in history." },
  { k: "sqlassign", label: "SQL Assignment", emoji: "\u{1F3AF}", div: "SALES", dated: true, note: "Pick a closer (load shown) and set Status to Assigned to push it to the Closer Pipeline." },
  { k: "closer", label: "Closer Pipeline", emoji: "\u{1F91D}", div: "SALES", dated: true, note: "Closed sends it to OPS. Closed Lost needs a reason and stays in history. Not Interested closes the deal without OPS." },
  { k: "saleskpi", label: "Sales KPIs", emoji: "\u{1F4C8}", kind: "kpi", div: "SALES" },
  { k: "ops", label: "OPS QA", emoji: "\u{1F50E}", div: "OPS", dated: true, singular: "Lead", note: "OPS QA verifies documents and records a reasoning for every decision. Approving with anything unverified auto-disapproves. Approved sends it to Onboarding." },
  { k: "msp", label: "Onboarding", emoji: "\u{1F6E0}\uFE0F", div: "OPS", dated: true, note: "Up to 3 MSP attempts, each Yes or No. Any Yes makes Final Status Approved and moves it to Fulfillment. All No keeps it Pending (never auto-rejected). Use Archived to close it out. A 2nd or 3rd attempt later than 24h after a failure is a fatal error and turns the row red." },
  { k: "fulfillment", label: "Fulfillment", emoji: "\u{1F4E6}", div: "OPS", dated: true, note: "Deploy equipment and set the merchant live." },
  { k: "leasing", label: "Leasing", emoji: "\u{1F4C4}", div: "OPS", dated: true, note: "Funding Status Funded opens a Customer Success record." },
  { k: "retention", label: "Customer Success", emoji: "\u{1F497}", div: "OPS", note: "Live merchants for follow-up. Comments are an append-only log stamped with name and time; merchants that churn or cancel are tracked here and on the dashboard." },
  { k: "opskpi", label: "OPS KPIs", emoji: "\u{1F4C8}", kind: "kpi", div: "OPS" },
  { k: "teamsetup", label: "Team Setup", emoji: "\u2699\uFE0F", div: "SALES", note: "Roster and live closer workload." },
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
  { key: "sales_head", label: "Sales Head & QA [SALES]", view: "all", edit: "sales", home: "leadgen", scope: "Sees all data, edits only the Sales side. OPS tabs are read-only. No CEO dashboard." },
  { key: "avp_sales", label: "AVP Sales [SALES]", view: "sales", edit: "sales", home: "leadgen", scope: "Full access to every Sales tab (Lead Gen through Team Setup). No OPS or CEO dashboard." },
  { key: "floor_manager", label: "Floor Manager [SALES]", view: ["sqlassign"], edit: [], home: "sqlassign", scope: "View only: every SQL across all teams. Cannot assign or edit — only Sales Head and AVP Sales can assign." },
  { key: "ops_manager", label: "Manager [OPS]", view: "ops", edit: "ops", home: "ops", scope: "Manager. Edits and assigns every lead and OPS QA record across OPS, and runs the QA accuracy audit." },
  { key: "ops_am", label: "Assistant Manager [OPS]", view: "ops", edit: "ops", home: "ops", scope: "Assistant Manager. Edits and assigns every lead and OPS QA record across OPS, and can run the QA accuracy audit." },
  { key: "lg_agent", label: "Lead Gen Agent [SALES]", view: ["leadgen"], edit: ["leadgen"], home: "leadgen", row: { leadgen: "ownLeadGen" }, scope: "Create new leads and view your own. After create, fields are locked — you can only add comments. Cannot delete." },
  { key: "lg_sup", label: "Lead Gen Supervisor [SALES]", view: ["sqlassign"], edit: [], home: "sqlassign", row: { sqlassign: "teamSQL" }, scope: "View only: the SQLs generated by your team." },
  { key: "qa_agent", label: "QA Agent [SALES]", view: ["qa"], edit: ["qa"], home: "qa", row: { qa: "ownQA" }, scope: "Only the leads assigned to you for QA." },
  { key: "closer", label: "Closer [SALES]", view: ["closer"], edit: ["closer"], home: "closer", row: { closer: "ownCloser" }, scope: "Only the deals assigned to you." },
  { key: "ops_verifier", label: "QA & Funding Lead [OPS]", view: ["ops"], edit: ["ops"], home: "ops", scope: "Leads OPS QA. Sees, edits, assigns and revokes all OPS verification." },
  { key: "ops_qa_agent", label: "Quality Assurance [OPS]", view: ["ops"], edit: ["ops"], home: "ops", row: { ops: "ownOps" }, scope: "Only the OPS leads assigned to you for verification." },
  { key: "onboarding_lead", label: "Onboarding Lead [OPS]", view: ["msp", "fulfillment", "leasing"], edit: ["msp", "fulfillment", "leasing"], home: "msp", scope: "Leads onboarding. Edits and assigns the whole team's submissions, plus Fulfillment and Leasing." },
  { key: "onb_agent", label: "Onboarding Agent [OPS]", view: ["msp"], edit: ["msp"], home: "msp", row: { msp: "ownOnb" }, scope: "End-to-end ownership: only the submissions assigned to you, and only you chase them." },
  { key: "cs_head", label: "Customer Success Head [OPS]", view: ["retention"], edit: ["retention"], home: "retention", scope: "Heads Customer Success. Edits the whole team." },
  { key: "cs_lead", label: "Customer Success Lead [OPS]", view: ["retention"], edit: ["retention"], home: "retention", scope: "All customer success cases. Assigns to agents." },
  { key: "cs_agent", label: "Customer Success Agent [OPS]", view: ["retention"], edit: ["retention"], home: "retention", row: { retention: "ownRet" }, scope: "Only the cases assigned to you." },
];

export const roleByKey = (key: string): RoleDef =>
  ROLES.find((r) => r.key === key) || ROLES[ROLES.length - 1];

export const resolveTabs = (spec: RoleDef["view"]): TabKey[] =>
  spec === "all" ? TABS.map((t) => t.k)
    : spec === "sales" ? SALES_TABS
    : spec === "ops" ? OPS_TABS
    : Array.isArray(spec) ? spec : [];

export const CEO_ROLES = ["ceo", "super_admin"];
export const MGR_ROLES = ["ceo", "super_admin", "ops_manager", "ops_am"];
export const DELETE_ROLES = ["ceo", "super_admin", "ops_manager", "ops_am", "cs_head", "cs_lead"];
export const ADDABLE: TabKey[] = ["leadgen", "ops", "teamsetup"];
export const USER_ADMIN_ROLES = ["ceo", "super_admin"];

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
  "AVP Sales": "avp_sales",
  "Floor Manager": "floor_manager",
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
  "Quality Assurance": "ops_qa_agent",
};

export const SALES_TEAMS = ["Olympus", "Phoenix", "Spartan", "Titans"];
