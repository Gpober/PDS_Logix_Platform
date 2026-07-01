-- =============================================================================
-- PDS Logix Platform — 0002_rls.sql
-- Role helper, table grants, and Row-Level Security policies.
-- Run AFTER 0001. Safe to re-run.
--
-- ACCESS MODEL
--   * Every signed-in team member can read/write clients, contacts, staff,
--     assets, jobs and condition_reports.
--   * price/cost are isolated in job_pricing, which ONLY owner/admin can touch
--     (select/insert/update/delete). A member's session matches zero rows there,
--     so the numbers never leave the database for them — enforced by RLS, not UI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- is_owner(): true when the current user is owner or admin.
-- SECURITY DEFINER so it can read profiles regardless of that table's own RLS,
-- and so policies stay a single fast boolean check.
-- -----------------------------------------------------------------------------
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- -----------------------------------------------------------------------------
-- Table privileges. RLS filters ROWS; these GRANTs are the table-level gate.
-- Only the authenticated role gets access — anon (logged-out) gets nothing here.
-- job_pricing is granted to authenticated too, but its RLS (below) limits the
-- visible rows to owner/admin. The grant is required so the security-invoker
-- view in 0003 can read it on behalf of an owner.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.clients, public.contacts, public.staff, public.assets,
     public.jobs, public.job_pricing, public.condition_reports, public.profiles
  to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on everything.
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.contacts          enable row level security;
alter table public.staff             enable row level security;
alter table public.assets            enable row level security;
alter table public.jobs              enable row level security;
alter table public.job_pricing       enable row level security;
alter table public.condition_reports enable row level security;

-- -----------------------------------------------------------------------------
-- profiles: everyone signed in can read the team list; only owner/admin can
-- change roles/profiles. This prevents a member from self-escalating to owner.
-- (Inserts come from the SECURITY DEFINER signup trigger, which bypasses RLS.)
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_modify on public.profiles;
create policy profiles_modify on public.profiles
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- -----------------------------------------------------------------------------
-- Shared entities: all team members have full read/write.
-- -----------------------------------------------------------------------------
drop policy if exists clients_all on public.clients;
create policy clients_all on public.clients
  for all to authenticated using (true) with check (true);

drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts
  for all to authenticated using (true) with check (true);

drop policy if exists staff_all on public.staff;
create policy staff_all on public.staff
  for all to authenticated using (true) with check (true);

drop policy if exists assets_all on public.assets;
create policy assets_all on public.assets
  for all to authenticated using (true) with check (true);

drop policy if exists jobs_all on public.jobs;
create policy jobs_all on public.jobs
  for all to authenticated using (true) with check (true);

drop policy if exists condition_reports_all on public.condition_reports;
create policy condition_reports_all on public.condition_reports
  for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- job_pricing: owner/admin ONLY, for read AND write. This single policy is the
-- airtight pricing restriction — there is no row a member can select, insert,
-- update or delete here.
-- -----------------------------------------------------------------------------
drop policy if exists job_pricing_owner_only on public.job_pricing;
create policy job_pricing_owner_only on public.job_pricing
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());
