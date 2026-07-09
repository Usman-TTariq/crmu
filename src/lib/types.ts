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

export interface Attachment {
  id: string;
  lead_id: string;
  stage: "closer" | "ops";
  storage_path: string;
  file_name: string;
  file_size: number;
  file_ext: string;
  signed_url?: string;
}

export interface RetentionComment {
  id: string;
  lead_id: string;
  author: string;
  body: string;
  created_at: string;
}

// Generic record — pages work with loosely-typed rows driven by field schemas
export type Rec = Record<string, unknown> & { id: string; lead_id?: string };

export interface SessionInfo {
  userId: string;
  email: string;
  profile: Profile;
}
