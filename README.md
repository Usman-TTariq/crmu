# TGT Nexus CRM

Production CRM for the TGT Nexus POS operations pipeline — Next.js (App Router) + Supabase (Postgres, Auth, Storage, RLS).

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** and run the files in `sql/` **in order**:
   - `01_schema.sql` — tables, lead-ID sequence, indexes, storage bucket
   - `02_triggers.sql` — pipeline auto-advance + validation rules
   - `03_rls.sql` — row-level security policies per role
   - `04_dashboards.sql` — dashboard RPC functions
   - `05_seed.sql` — teams + roster profiles
   - `06_demo_data.sql` — *(optional)* sample leads across every pipeline stage, for demos/testing
   - `07_sessions.sql` — Active Logins dropdown in the top navbar (who is signed in, device, IP) plus admin remote sign-out (per user, or everyone at once)
   - `08_roles_floor_avp.sql` — AVP Sales + Floor Manager role deltas (if upgrading an older DB)
   - `09_presence.sql` — Employee Monitor: live working/idle/away heartbeats, daily + weekly work totals, status timeline
   - `10_presence_hours.sql` — *(upgrade)* weekly hours + day-by-day week breakdown if you already ran an older `09_presence.sql`
   - `11_last_7_days_tf.sql` — *(upgrade)* rolling “Last 7 days” timeframe for dashboards/KPIs (header dropdown; lists also filter in app code)
3. In **Authentication → Providers**, keep Email enabled. Disable public signups (Authentication → Settings → "Allow new users to sign up" off) — accounts are created by admins from the Team Setup tab.

### 2. App

```bash
npm install
copy .env.example .env.local   # fill in your Supabase URL + keys
npm run dev
```

### 3. First admin

The seed creates roster profiles but no logins. Create the first login manually:

1. Supabase Dashboard → Authentication → Users → **Add user** (email + password, confirm email).
2. SQL Editor: link it to the CEO (or Super Admin) profile:

```sql
update public.profiles
set user_id = '5f02f016-b65b-4237-af4a-83dc6b7d31ff'
where full_name = 'CEO';
```

3. Sign in at `/login`. From **Team Setup** you can now create logins for everyone else.

## Rules baked into the database

- New lead → QA record auto-created (Pending)
- QA Qualified needs all 6 checks Yes (monthly volume is informational) → SQL assignment created
- SQL Assigned + closer → closer deal (No Answer)
- Closed Won → OPS verification; Closed Lost requires a reason
- OPS Approved with any unverified doc → auto-flips Disapproved
- Any MSP attempt Yes → Approved → Fulfillment (+ Leasing) created
- Leasing Funded → Customer Success record (Active)
- Retention comments are append-only
- Late 2nd/3rd onboarding attempts (>24h) surface as fatal errors

## Team & access management (Team Setup, admin only)

- **Create login** — makes an email + password account and links it to a roster profile.
- **Manage access** — deactivate/reactivate a member (removes them from dropdowns and blocks sign-in, history kept) or revoke a login (deletes the account and ends all its sessions; the profile stays).
- A member's **access role is derived from their title** — pick the title, the role follows automatically.

## Conventions

- All reads/writes go through server actions; data always travels in the request payload (JSON body / FormData), never in URL query params.
- `src/proxy.ts` is the Next.js 16 request proxy (the renamed `middleware.ts` convention): it refreshes the Supabase session cookie and redirects unauthenticated visitors to `/login`.
- File uploads: private `documents` bucket, 10 MB max, pdf/jpg/jpeg/png/gif/webp, previewed via short-lived signed URLs.
- The `SUPABASE_SERVICE_ROLE_KEY` is used only in server-side admin actions (user creation, cross-role enrichment) and must never reach the client.
