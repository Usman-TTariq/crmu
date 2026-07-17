/**
 * Audit + fix login links: profiles.user_id ↔ auth.users
 * Usage: node scripts/audit-logins.mjs
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env
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
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function emailLocal(email) {
  return String(email || "")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const { data: profiles, error: pErr } = await admin
  .from("profiles")
  .select("id, full_name, title, team, is_active, user_id")
  .order("full_name");
if (pErr) {
  console.error("profiles:", pErr.message);
  process.exit(1);
}

const { data: usersData, error: uErr } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (uErr) {
  console.error("auth.users:", uErr.message);
  process.exit(1);
}

const users = usersData?.users || [];
const userById = new Map(users.map((u) => [u.id, u]));
const linkedIds = new Set(
  (profiles || []).map((p) => p.user_id).filter(Boolean)
);

const active = (profiles || []).filter((p) => p.is_active !== false);
const rows = active.map((p) => {
  const u = p.user_id ? userById.get(p.user_id) : null;
  let status = "OK";
  if (!p.user_id) status = "NO_LOGIN";
  else if (!u) status = "ORPHAN_USER_ID";
  return {
    id: p.id,
    full_name: p.full_name,
    team: p.team,
    user_id: p.user_id,
    auth_email: u?.email || "",
    status,
  };
});

const noLogin = rows.filter((r) => r.status === "NO_LOGIN");
const orphans = rows.filter((r) => r.status === "ORPHAN_USER_ID");
const ok = rows.filter((r) => r.status === "OK");
const unlinkedAuth = users.filter((u) => !linkedIds.has(u.id));

console.log("\n=== LOGIN AUDIT ===");
console.log(`OK: ${ok.length} | NO_LOGIN: ${noLogin.length} | ORPHAN_USER_ID: ${orphans.length}`);
console.log(`Auth users with no profile: ${unlinkedAuth.length}\n`);

if (noLogin.length) {
  console.log("--- NO_LOGIN (Create Login in Team Setup) ---");
  for (const r of noLogin) console.log(`  ${r.full_name} [${r.team || "-"}]`);
}
if (orphans.length) {
  console.log("\n--- ORPHAN_USER_ID (clearing bad user_id) ---");
  for (const r of orphans) console.log(`  ${r.full_name} user_id=${r.user_id}`);
  for (const r of orphans) {
    const { error } = await admin.from("profiles").update({ user_id: null }).eq("id", r.id);
    if (error) console.log(`  FAIL clear ${r.full_name}: ${error.message}`);
    else console.log(`  cleared ${r.full_name}`);
  }
}

// Link unlinked Auth users → unique NO_LOGIN profile by name≈email local-part
console.log("\n--- Auto-link UNLINKED_AUTH → NO_LOGIN (unique name match) ---");
const stillNoLogin = (
  await admin.from("profiles").select("id, full_name, user_id").is("user_id", null)
).data || [];

let linked = 0;
for (const u of unlinkedAuth) {
  const local = emailLocal(u.email);
  if (!local) continue;
  const matches = stillNoLogin.filter((p) => {
    const n = normName(p.full_name);
    return n === local || n.includes(local) || local.includes(n);
  });
  if (matches.length !== 1) {
    console.log(
      `  skip ${u.email}: ${matches.length === 0 ? "no" : "ambiguous"} profile match`
    );
    continue;
  }
  const p = matches[0];
  const { error } = await admin.from("profiles").update({ user_id: u.id }).eq("id", p.id);
  if (error) {
    console.log(`  FAIL link ${u.email} → ${p.full_name}: ${error.message}`);
    continue;
  }
  console.log(`  linked ${u.email} → ${p.full_name}`);
  p.user_id = u.id;
  linked++;
}

console.log(`\nLinked: ${linked}`);
console.log(
  "\nYes-but-fail logins: use Team Setup → Set password (password is not in DB)."
);
console.log("Remaining NO_LOGIN: Team Setup → Create Login.\n");

// Re-summary
const { data: profiles2 } = await admin
  .from("profiles")
  .select("id, full_name, user_id, is_active")
  .order("full_name");
const { data: users2 } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const byId2 = new Map((users2?.users || []).map((u) => [u.id, u]));
const summary = { OK: 0, NO_LOGIN: 0, ORPHAN_USER_ID: 0 };
for (const p of profiles2 || []) {
  if (p.is_active === false) continue;
  if (!p.user_id) summary.NO_LOGIN++;
  else if (!byId2.get(p.user_id)) summary.ORPHAN_USER_ID++;
  else summary.OK++;
}
console.log("=== AFTER FIX ===", summary);
