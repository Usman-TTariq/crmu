import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getViewAsName } from "@/actions/impersonate";
import { AppProvider } from "@/components/app-context";
import AppShell from "@/components/AppShell";
import type { Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    // If an auth user exists but has no active linked profile, sign them out
    // (going straight to /login would loop: the proxy bounces signed-in users
    // away from /login).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/logout" : "/login");
  }

  const supabase = await createClient();
  const [{ data: profiles }, viewAsName] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, user_id, full_name, title, dept, team, role_key, target, is_active, notes")
      .order("full_name"),
    getViewAsName(),
  ]);

  return (
    <AppProvider
      session={session}
      profiles={(profiles || []) as Profile[]}
      viewAsName={viewAsName}
    >
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
