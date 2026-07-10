-- =============================================================================
-- Tulips Talent — 0005_talent_role.sql  (PHASE 3: add the talent role)
-- Introduces a self-scoped `talent` role so a future talent-facing app can let
-- each creator see ONLY their own bookings/links/profile — WITHOUT weakening the
-- existing team model. Run AFTER 0001–0004. Safe to re-run.
--
-- ROLE SUMMARY AFTER THIS MIGRATION
--   owner / admin : full CRM + budget   (unchanged)
--   member        : full CRM, no budget (unchanged — "staff")
--   talent        : NEW — reads only their own talent row, their own deals, and
--                   the brands those deals reference. No agencies/people/leads,
--                   no other talent, no budget.
--
-- The team app (phase 3) is unaffected: staff policies still grant full access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Allow 'talent' as a role, and link a talent row to an auth user.
-- -----------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'member', 'talent'));

alter table public.talent
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists idx_talent_user_id on public.talent(user_id)
  where user_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Role helpers. SECURITY DEFINER so they read profiles/talent without being
--    re-filtered by RLS (prevents recursion inside policies).
-- -----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner', 'admin', 'member')
  );
$$;

create or replace function public.is_talent()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'talent'
  );
$$;

-- The talent.id linked to the current user (null for staff).
create or replace function public.current_talent_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.talent where user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 3. Rescope policies: blanket "any authenticated" access becomes STAFF-only,
--    and talent get narrow, self-scoped SELECT policies.
-- -----------------------------------------------------------------------------

-- brands: staff full; talent may read only brands tied to their own deals.
drop policy if exists brands_all on public.brands;
drop policy if exists brands_staff_all on public.brands;
create policy brands_staff_all on public.brands
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists brands_talent_read on public.brands;
create policy brands_talent_read on public.brands
  for select to authenticated
  using (
    public.is_talent()
    and exists (
      select 1 from public.deals d
      where d.brand_id = brands.id
        and d.talent_id = public.current_talent_id()
    )
  );

-- talent: staff full; a talent may read only their own row.
drop policy if exists talent_all on public.talent;
drop policy if exists talent_staff_all on public.talent;
create policy talent_staff_all on public.talent
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists talent_self_read on public.talent;
create policy talent_self_read on public.talent
  for select to authenticated
  using (public.is_talent() and id = public.current_talent_id());

-- deals: staff full; a talent may read only their own deals (no writes).
drop policy if exists deals_all on public.deals;
drop policy if exists deals_staff_all on public.deals;
create policy deals_staff_all on public.deals
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists deals_talent_read on public.deals;
create policy deals_talent_read on public.deals
  for select to authenticated
  using (public.is_talent() and talent_id = public.current_talent_id());

-- agencies & people: staff only (talent get no access at all).
drop policy if exists agencies_all on public.agencies;
drop policy if exists agencies_staff_all on public.agencies;
create policy agencies_staff_all on public.agencies
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists people_all on public.people;
drop policy if exists people_staff_all on public.people;
create policy people_staff_all on public.people
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- leads: staff only (was "any authenticated" — talent must not read leads).
drop policy if exists leads_team_all on public.leads;
drop policy if exists leads_staff_all on public.leads;
create policy leads_staff_all on public.leads
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- profiles: staff see the whole team; a talent sees only their own profile.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (public.is_staff() or id = auth.uid());

-- deal_budgets is unchanged: still owner/admin-only (is_owner()), so talent and
-- members never receive a budget. No new policy needed here.

-- -----------------------------------------------------------------------------
-- To onboard a creator later:
--   1) create the auth user (invite-only),
--   2) update public.profiles set role = 'talent' where id = <user_id>;
--   3) update public.talent set user_id = <user_id> where id = <talent_row_id>;
-- -----------------------------------------------------------------------------
