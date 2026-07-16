"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignInPayload {
  email: string;
  password: string;
}

export async function signIn(payload: SignInPayload): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: payload.email,
    password: payload.password,
  });
  if (error) return { error: error.message };
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.rpc("presence_offline");
  } catch {
    // Presence SQL may not be applied yet; never block logout.
  }
  await supabase.auth.signOut();
  redirect("/login");
}
