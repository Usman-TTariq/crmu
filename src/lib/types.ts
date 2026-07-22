// Row types matching the Postgres schema (snake_case columns)

export interface Profile {
  id: string;
  user_id: string | null;
  full_name: string;
  title: string;
  dept: "SALES" | "OPS" | "ALL";
  team: string;
  role_key: string;
  target: string;
  is_active: boolean;
  notes: string;
}

export type AttachmentDocType =
  | "driving_license"
  | "voided_cheque"
  | "bank_statement"
  | "business_license"
  | "proof_of_address"
  | "processing_statement"
  | "other";

export interface Attachment {
  id: string;
  lead_id: string;
  stage: "closer" | "ops" | "documentation" | "msp";
  storage_path: string;
  file_name: string;
  file_size: number;
  file_ext: string;
  doc_type?: AttachmentDocType | null;
  signed_url?: string;
}

export interface LeadComment {
  id: string;
  lead_id: string;
  author: string;
  body: string;
  created_at: string;
}

/** @deprecated alias — same shape as LeadComment */
export type RetentionComment = LeadComment;

// Generic record — pages work with loosely-typed rows driven by field schemas
export type Rec = Record<string, unknown> & { id: string; lead_id?: string };

export interface SessionInfo {
  userId: string;
  email: string;
  profile: Profile;
}
