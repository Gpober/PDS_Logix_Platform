# Tulips Talent — Database (Supabase / Postgres)

Apply these in order in the **Supabase SQL editor** (or `psql`):

1. `migrations/0001_schema.sql` — tables, enum, FKs, indexes, `profiles` + signup trigger
2. `migrations/0002_rls.sql` — `is_owner()`, grants, RLS policies
3. `migrations/0003_views.sql` — derived-field + budget-aware views
4. `migrations/0004_public.sql` — public website surface (flags, `leads`, `public_*` views)
5. `migrations/0005_talent_role.sql` — adds the self-scoped `talent` role (phase 3)
6. `seed.sql` — CRM sample data (run once on an empty DB)
7. `seed_public.sql` — opt the sample data into the public website

## Roles (after 0005)

| role | CRM access | budget |
|------|------------|--------|
| `owner` / `admin` | full | yes |
| `member` (staff) | full read/write on all entities | no |
| `talent` | only their own talent row, their own deals, brands tied to those deals | no |

Onboard a creator: create the auth user, then
`update profiles set role='talent' where id=<uid>;` and
`update talent set user_id=<uid> where id=<talent_row>;`

## Public website surface (Phase 2)

The website uses the **anon** role only. Its entire read surface is three
`security definer` views — `public_talent`, `public_brands`,
`public_talent_partnerships` — each exposing an explicit safe-column list and
only opted-in rows (`is_public` / `is_shareable`). The anon role has **no**
grants on any base table, so sensitive fields cannot leak.

### Verify the anon role can't reach anything sensitive
```sql
set role anon;

select * from public.talent;          -- ERROR: permission denied (no grant)
select * from public.deals;           -- ERROR: permission denied
select * from public.deal_budgets;    -- ERROR: permission denied (budget unreachable)
select * from public.people;          -- ERROR: permission denied (emails/phones unreachable)
select * from public.leads;           -- ERROR: permission denied (write-only for anon)

select * from public.public_talent;   -- OK: only is_public rows, safe columns only
insert into public.leads (name, email) values ('Test', 'test@example.com'); -- OK

reset role;
```

## Auth setup

Self-signup is **off** (invite-only). In the Supabase dashboard:
**Authentication → Providers → Email → disable "Allow new users to sign up"**,
then create users via **Authentication → Users → Add user** (or the Admin API).
Every created user automatically gets a `profiles` row with `role = 'member'`.
`seed.sql` promotes `gpober06@gmail.com` to `owner` (re-run that final
`UPDATE` if you create your account after seeding).

## The budget restriction (how it's enforced)

`budget` is **not** a column on `deals`. It lives in `deal_budgets`, which has a
single RLS policy: `using (is_owner()) with check (is_owner())`. A member's
session matches zero rows there for select/insert/update/delete, so the value
never leaves the database. The app reads deals through `deals_with_budget`, a
`security_invoker` view whose `LEFT JOIN` to `deal_budgets` is evaluated as the
caller — owners get the number, members get `NULL`.

### Verify it yourself

Run as a member (e.g. set the role on a test profile to `member`), then in the
SQL editor impersonate that JWT, or test from the app logged in as each role:

```sql
-- As owner: budget populated. As member: budget is NULL.
select id, status, budget from public.deals_with_budget order by booking_date desc;

-- As member: returns 0 rows (permission/row filter), never a number.
select * from public.deal_budgets;
```

## Derived Brand fields

`brand_overview` computes `date_last_booked` and `latest_live_url` live per
brand; `brand_talent` is the distinct "Talent worked with" related list. Nothing
is a manually maintained column.

## Environment variables (used by the app, never committed)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# server-only, never exposed to the browser:
SUPABASE_SERVICE_ROLE_KEY=...
```
