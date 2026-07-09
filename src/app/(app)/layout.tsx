import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AppProvider } from "@/components/app-context";
import AppShell from "@/components/AppShell";
import type { Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");

  return (
    <AppProvider session={session} profiles={(profiles || []) as Profile[]}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
