/**
 * One-off: create Finance roster + auth login (service role).
 * Usage: node scripts/create-finance-user.mjs
 * Does not print or commit secrets except the generated password to stdout.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envText = readFileSync(resolve(root, ".env"), "utf8");
function env(key) {
  const m = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) throw new Error(`Missing ${key} in .env`);
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
const email = "finance@tgtnexus.com";
const password = `Fnx!${randomBytes(6).toString("base64url")}`;

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let { data: profile, error: pErr } = await admin
  .from("profiles")
  .select("id, user_id, full_name, role_key")
  .eq("full_name", "Finance")
  .maybeSingle();
if (pErr) throw pErr;

if (!profile) {
  const { data: inserted, error: iErr } = await admin
    .from("profiles")
    .insert({
      full_name: "Finance",
      title: "Finance",
      dept: "ALL",
      team: "",
      role_key: "finance",
      target: "",
      is_active: true,
    })
    .select("id, user_id, full_name, role_key")
    .single();
  if (iErr) throw iErr;
  profile = inserted;
} else if (profile.role_key !== "finance") {
  const { data: updated, error: uErr } = await admin
    .from("profiles")
    .update({ role_key: "finance", title: "Finance", dept: "ALL", is_active: true })
    .eq("id", profile.id)
    .select("id, user_id, full_name, role_key")
    .single();
  if (uErr) throw uErr;
  profile = updated;
}

const profileId = profile.id;

if (profile.user_id) {
  const { error: pwErr } = await admin.auth.admin.updateUserById(profile.user_id, {
    password,
    email_confirm: true,
  });
  if (pwErr) throw pwErr;
  console.log(JSON.stringify({ email, password, profileId, action: "password_reset_existing" }, null, 2));
  process.exit(0);
}

// If auth user already exists for this email, link it
const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const found = listed?.users?.find((u) => (u.email || "").toLowerCase() === email);
let userId = found?.id;
if (userId) {
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (pwErr) throw pwErr;
} else {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr) throw cErr;
  userId = created.user.id;
}

const { error: linkErr } = await admin
  .from("profiles")
  .update({ user_id: userId })
  .eq("id", profileId);
if (linkErr) throw linkErr;

console.log(
  JSON.stringify({ email, password, profileId, userId, action: "created_or_linked" }, null, 2)
);
