// Signs the current user out and returns to /login. Used when an
// authenticated auth user has no usable profile (unlinked or deactivated),
// which would otherwise bounce between the proxy and the app layout.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
