# PDS Logix CRM — Database (Supabase / Postgres)

The live Supabase project is the source of truth. These files mirror its schema
so the repo is self-describing; apply them in order on a fresh database:

1. `migrations/0001_schema.sql` — enums, tables, FKs, indexes, `profiles` + signup trigger
2. `migrations/0002_rls.sql` — `is_team()`, RLS policies, anon lead-insert grant

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
