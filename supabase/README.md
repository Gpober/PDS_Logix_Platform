# PDS Logix — Database (Supabase / Postgres)

PDS Logix is a vehicle services platform with three service lines —
**Condition Reports** (inspections), **Detailing** (reconditioning), and
**Biohazard** (remediation). Clients hire PDS; each **job** services one
**asset** (a vehicle) and is performed by a **staff** member. Pricing is
isolated so only owner/admin can see it.

## Live project

Provisioned on Supabase as **"PDS Logix CRM"** (a dedicated project, separate
from the I AM CFO finance/payroll back-office):

- Project ref: `xqyxpefsukilkqevspfv`
- URL: `https://xqyxpefsukilkqevspfv.supabase.co`
- Region: `us-east-1`

Migrations `0001`–`0004` and `seed.sql` are **already applied** here. RLS is
enabled on all tables. Put the URL + publishable (anon) key in `.env.local`
(see `.env.example`).

Apply these in order in the **Supabase SQL editor** (or `psql`):

1. `migrations/0001_schema.sql` — tables, enums, FKs, indexes, `profiles` + signup trigger
2. `migrations/0002_rls.sql` — `is_owner()`, grants, RLS policies
3. `migrations/0003_views.sql` — derived-field + pricing-aware views
4. `migrations/0004_public.sql` — public website surface (flags, `leads`, `public_*` views)
5. `migrations/0005_leads_grant_hardening.sql` — strip anon on `leads` back to INSERT-only
6. `seed.sql` — CRM sample data (run once on an empty DB)

## Entities

| Table | What it is |
|-------|-----------|
| `profiles` | One row per auth user; carries the `owner`/`admin`/`member` role for RLS |
| `clients` | Companies that hire PDS (dealership, fleet, rental, insurer, body shop) |
| `contacts` | People at a client company |
| `staff` | The PDS crew who perform the work (inspect, photo, detail, biohazard) |
| `assets` | The vehicle being serviced (VIN, year/make/model, mileage, plate) |
| `jobs` | A work order: one `service_type`, on one asset, for one client |
| `job_pricing` | 1:1 with a job — `price`/`cost`, **owner/admin only** |
| `condition_reports` | 1:1 with a condition-report job — findings + photos (JSONB) |
| `leads` | Inbound "request a quote" submissions from the public site |

`service_type` ∈ `condition_report | detailing | biohazard`
`job_status`  ∈ `requested → scheduled → in_progress → completed → invoiced`

## Roles

| role | CRM access | pricing (`job_pricing`) |
|------|------------|-------------------------|
| `owner` / `admin` | full | yes |
| `member` (staff)  | full read/write on all entities | **no** |

New auth users get a `member` profile automatically (signup trigger). Promote:
`update profiles set role='owner' where id=<uid>;`

## Pricing isolation — how it's locked down

`price`/`cost` live in **`job_pricing`**, not on `jobs`. Its only RLS policy is
`is_owner()` for select **and** write, so a `member` session matches zero rows —
the numbers never leave the database for them. The CRM reads jobs through the
`jobs_with_pricing` view, which is `security_invoker`: the left join to
`job_pricing` is evaluated as the caller, so `price`/`cost` come back `NULL` for
members and populated for owner/admin. Same view, database decides.

## Public website surface (Phase 2)

The website uses the **anon** role only. Its entire read surface is two
`security definer` views — `public_clients` (a "trusted by" wall) and
`public_work` (opted-in completed jobs as a portfolio) — each exposing an
explicit safe-column list and only opted-in rows (`is_public` / `is_shareable`).
The anon role has **no** grant on the base tables, so `job_pricing`, VINs,
`notes`, emails and phones are physically unreachable. `leads` is write-only for
anon (INSERT via RLS, SELECT never granted). Nothing is public until opted in
from the CRM — every flag defaults `false`.

### Verify the anon role can't read sensitive data

```sql
-- As the anon role these must all fail / return nothing:
set role anon;
select * from public.job_pricing;   -- ERROR: permission denied
select vin from public.assets;      -- ERROR: permission denied
select * from public.leads;         -- ERROR: permission denied (insert-only)
select * from public.public_clients;-- OK, but only is_public rows / safe columns
reset role;
```
