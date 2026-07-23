import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — server only. Never import from client components.
// Module singleton: one client per warm serverless isolate (avoids reconnect churn).
let adminClient: SupabaseClient | null = null;

export function createAdminClient() {
  if (adminClient) return adminClient;
  adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return adminClient;
}
