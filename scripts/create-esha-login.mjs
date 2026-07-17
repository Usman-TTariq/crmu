/**
 * Create/link Esha Sajjad Project Manager login.
 * Usage: node scripts/create-esha-login.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envText = readFileSync(resolve(root, ".env"), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const email = "esha.sajjad@tgtnexus.net";
const password = "Esha#Doc24!xK9";
const fullName = "Esha Sajjad";

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let { data: profile } = await admin
  .from("profiles")
  .select("id, user_id, full_name")
  .eq("full_name", fullName)
  .maybeSingle();

if (!profile) {
  const { data: created, error } = await admin
    .from("profiles")
    .insert({
      full_name: fullName,
      title: "Project Manager",
      // DOCUMENTATION allowed after sql/24_documentation_stage.sql; ALL works beforehand
      dept: "ALL",
      team: "",
      role_key: "project_manager",
      target: "",
      notes: "Documentation stage owner",
      is_active: true,
    })
    .select("id, user_id, full_name")
    .single();
  if (error) {
    console.error("profile insert:", error.message);
    process.exit(1);
  }
  profile = created;
} else {
  const patch = {
    title: "Project Manager",
    role_key: "project_manager",
  };
  const { error: deptErr } = await admin
    .from("profiles")
    .update({ ...patch, dept: "DOCUMENTATION" })
    .eq("id", profile.id);
  if (deptErr) {
    await admin.from("profiles").update(patch).eq("id", profile.id);
    console.log("Note: dept DOCUMENTATION not applied yet — run sql/24 first, then re-run this script.");
  }
}

if (profile.user_id) {
  const { error } = await admin.auth.admin.updateUserById(profile.user_id, {
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("update user:", error.message);
    process.exit(1);
  }
  console.log("Updated existing login.");
} else {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr) {
    console.error("create user:", cErr.message);
    process.exit(1);
  }
  const { error: linkErr } = await admin
    .from("profiles")
    .update({ user_id: created.user.id })
    .eq("id", profile.id);
  if (linkErr) {
    console.error("link:", linkErr.message);
    process.exit(1);
  }
  console.log("Created new login.");
}

console.log(`Email: ${email}`);
console.log(`Password: ${password}`);
console.log(`Profile: ${fullName} (project_manager)`);
