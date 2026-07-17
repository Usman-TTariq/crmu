/**
 * Generate unique passwords for all linked Auth users except excluded admins,
 * set them in Supabase Auth, write CSV to tmp/.
 * Usage: node scripts/bulk-reset-passwords.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const EXCLUDE_EMAILS = new Set(["yasal.khan@tgtnexus.net"]);

function isExcluded(fullName, email) {
  const e = String(email || "").toLowerCase().trim();
  if (EXCLUDE_EMAILS.has(e)) return true;
  const n = norm(fullName);
  if (!n) return false;
  if (n === "abdullahzahid" || (n.includes("abdullah") && n.includes("zahid"))) return true;
  if (n.includes("rogatia") || n === "usmanrogatia") return true;
  if (n.includes("khanzada") || n.includes("khanazada")) return true;
  if (n === "yasalkhan" || n.includes("yasal")) return true;
  return false;
}

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function genPassword() {
  const pick = (set) => set[randomBytes(1)[0] % set.length];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < 16) chars.push(pick(ALL));
  // shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const { data: profiles, error: pErr } = await admin
  .from("profiles")
  .select("id, full_name, user_id, is_active")
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
  console.error("auth:", uErr.message);
  process.exit(1);
}

const userById = new Map((usersData?.users || []).map((u) => [u.id, u]));

const candidates = [];
for (const p of profiles || []) {
  if (p.is_active === false) continue;
  if (!p.user_id) continue;
  const u = userById.get(p.user_id);
  if (!u?.email) continue;
  candidates.push({
    full_name: p.full_name,
    email: u.email,
    user_id: p.user_id,
  });
}

const skip = [];
const include = [];
for (const c of candidates) {
  if (isExcluded(c.full_name, c.email)) skip.push(c);
  else include.push(c);
}

const used = new Set();
const rows = [];
for (const c of include) {
  let pw;
  do {
    pw = genPassword();
  } while (used.has(pw));
  used.add(pw);
  rows.push({ ...c, password: pw });
}

let updated = 0;
let failed = 0;
const failures = [];

for (const r of rows) {
  const { error } = await admin.auth.admin.updateUserById(r.user_id, {
    password: r.password,
  });
  if (error) {
    failed++;
    failures.push(`${r.email}: ${error.message}`);
  } else {
    updated++;
  }
}

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const tmpDir = resolve(root, "tmp");
mkdirSync(tmpDir, { recursive: true });
const outPath = resolve(tmpDir, `roster-passwords-${stamp}.csv`);

const header = "full_name,email,password";
const body = rows
  .filter((r) => !failures.some((f) => f.startsWith(r.email + ":")))
  .map((r) => [r.full_name, r.email, r.password].map(csvEscape).join(","))
  .join("\n");

// Include failed attempts with empty password note? Better write all intended passwords
// even if Auth update failed, so admin can retry — but mark failed separately.
// Plan: CSV of successfully updated only is safer; also write all with status.
const csvAll = [
  "full_name,email,password,status",
  ...rows.map((r) => {
    const ok = !failures.some((f) => f.startsWith(r.email + ":"));
    return [r.full_name, r.email, r.password, ok ? "updated" : "failed"]
      .map(csvEscape)
      .join(",");
  }),
].join("\n");

writeFileSync(outPath, csvAll + "\n", "utf8");

console.log("=== Bulk password reset ===");
console.log(`Candidates (linked+active): ${candidates.length}`);
console.log(`Skipped (excluded): ${skip.length}`);
for (const s of skip) console.log(`  - ${s.full_name} <${s.email}>`);
console.log(`Updated: ${updated}`);
console.log(`Failed: ${failed}`);
for (const f of failures) console.log(`  ! ${f}`);
console.log(`CSV: ${outPath}`);
console.log("(Passwords not printed here.)");
