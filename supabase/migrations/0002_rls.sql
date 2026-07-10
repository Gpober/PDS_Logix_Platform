-- =============================================================================
-- Tulips Talent CRM — 0002_rls.sql
-- Role helper, table grants, and Row-Level Security policies.
-- Run AFTER 0001. Safe to re-run.
--
-- ACCESS MODEL
--   * Every signed-in team member can read/write brands, agencies, people,
--     talent and deals.
--   * budget is isolated in deal_budgets, which ONLY owner/admin can touch
--     (select/insert/update/delete). A member's session matches zero rows there,
--     so the value never leaves the database for them — enforced by RLS, not UI.
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
-- Only the authenticated role gets access — anon (logged-out) gets nothing.
-- deal_budgets is granted to authenticated too, but its RLS (below) limits the
-- visible rows to owner/admin. The grant is required so the security-invoker
-- view in 0003 can read it on behalf of an owner.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.brands, public.agencies, public.talent, public.people,
     public.deals, public.deal_budgets, public.profiles
  to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on everything.
-- -----------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.brands       enable row level security;
alter table public.agencies     enable row level security;
alter table public.talent       enable row level security;
alter table public.people       enable row level security;
alter table public.deals        enable row level security;
alter table public.deal_budgets enable row level security;

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
drop policy if exists brands_all on public.brands;
create policy brands_all on public.brands
  for all to authenticated using (true) with check (true);

drop policy if exists agencies_all on public.agencies;
create policy agencies_all on public.agencies
  for all to authenticated using (true) with check (true);

drop policy if exists talent_all on public.talent;
create policy talent_all on public.talent
  for all to authenticated using (true) with check (true);

drop policy if exists people_all on public.people;
create policy people_all on public.people
  for all to authenticated using (true) with check (true);

drop policy if exists deals_all on public.deals;
create policy deals_all on public.deals
  for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- deal_budgets: owner/admin ONLY, for read AND write. This single policy is the
-- airtight budget restriction — there is no row a member can select, insert,
-- update or delete here.
-- -----------------------------------------------------------------------------
drop policy if exists deal_budgets_owner_only on public.deal_budgets;
create policy deal_budgets_owner_only on public.deal_budgets
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());
