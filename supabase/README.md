# PDS Logix CRM — Database (Supabase / Postgres)

The live Supabase project is the source of truth. These files mirror its schema
so the repo is self-describing; apply them in order on a fresh database:

1. `migrations/0001_schema.sql` — enums, tables, FKs, indexes, `profiles` + signup trigger
2. `migrations/0002_rls.sql` — `is_team()`, RLS policies, anon lead-insert grant
3. `migrations/0003_quickbooks.sql` — QBO connection + `qbo_*` columns on clients/jobs
4. `migrations/0004_time_tracking.sql` — `time_entries`
5. `migrations/0005_assistant.sql` — `is_owner_admin()`, `assistant_drafts`, `assistant_memory`, `assistant_reports` (Zordon's write side; owner/admin only)
6. `migrations/0006_assistant_team.sql` — `team_runs` (the Railway worker's job queue; owner/admin RLS, worker uses the service role)
7. `migrations/0021_car_count_recon.sql` — `recon_batches` + `recon_units` and the
   matching functions (`recon_rows`, `get_recon_summary`, `get_recon_exceptions`)
   behind Car Count Recon

## Tables
- **profiles** — one per auth user; `role` in (`owner`, `admin`, `member`)
- **clients** — dealers / fleets / insurers (`is_public` opts a client into any public surface)
- **contacts** — people at a client
- **staff** — technicians / inspectors (`is_active`)
- **assets** — vehicles (`vin`, `year`/`make`/`model`, `mileage`, `license_plate`)
- **jobs** — `service_type` (`condition_report`|`detailing`|`biohazard`),
  `status` (`requested`→`scheduled`→`in_progress`→`completed`→`invoiced`)
- **job_pricing** — `price` / `cost` per job (margin = price − cost)
- **condition_reports** — inspection results (grades, notes, `findings`/`photos` JSON)
- **leads** — inbound "request service" submissions
- **time_entries** — staff clock in/out
- **quickbooks_connection** — the one company-wide QBO OAuth connection
- **assistant_drafts** — outreach emails Zordon composed (draft-only; owner/admin)
- **assistant_memory** — durable facts Zordon carries across sessions (owner/admin)
- **assistant_reports** — visual reports Zordon builds, as ordered `blocks` JSON (owner/admin)
- **team_runs** — the Zordon team worker's queue: a `scope` brief → `results` JSON (owner/admin; worker writes via the service role)
- **recon_batches** — one car-count reconciliation: counterparty (Manheim), location, period, the files loaded (owner/admin)
- **recon_units** — the uploaded units for a batch, `side` = `theirs` (their list) or `ours` (our own count file, when it isn't in the production log)

## Roles
| role | CRM access |
|------|------------|
| `owner` / `admin` / `member` | full read/write on all CRM tables |
| `anon` (public) | may only `INSERT` a lead — never read anything |

## Auth
Invite-only. Create users in the Supabase dashboard (Authentication → Users);
each new user automatically gets a `profiles` row with `role = 'member'`. Promote
an owner with:

```sql
update public.profiles set role = 'owner' where email = 'you@pdslogix.com';
```
