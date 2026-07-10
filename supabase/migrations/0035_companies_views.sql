-- =============================================================================
-- Tulips Talent CRM — 0035_companies_views.sql
-- Rebuild the derived views on top of companies/contacts + deals.company_id.
-- Run AFTER 0034 (company_id exists) and BEFORE 0036 (brand_id still exists).
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- company_overview: the Companies list with derived fields computed live.
-- Replaces brand_overview. Adds contact_count + carries type/status so the
-- list can sort and filter the way the AA Top Talent platform does.
-- -----------------------------------------------------------------------------
create or replace view public.company_overview
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.type,
  c.category,
  c.employee_count,
  c.website,
  c.status,
  c.logo_url,
  c.is_public,
  c.created_at,
  c.updated_at,
  (
    select max(d.booking_date)
    from public.deals d
    where d.company_id = c.id
  ) as date_last_booked,
  (
    select d.live_url
    from public.deals d
    where d.company_id = c.id
    order by d.booking_date desc nulls last, d.created_at desc
    limit 1
  ) as latest_live_url,
  (
    select count(*)
    from public.deals d
    where d.company_id = c.id
  ) as deal_count,
  (
    select count(*)
    from public.contacts ct
    where ct.company_id = c.id
  ) as contact_count
from public.companies c;

-- -----------------------------------------------------------------------------
-- company_talent: distinct talent each company has worked with. Replaces
-- brand_talent (column brand_id -> company_id).
-- -----------------------------------------------------------------------------
create or replace view public.company_talent
with (security_invoker = true) as
select distinct
  d.company_id,
  t.id       as talent_id,
  t.name     as talent_name,
  t.handle   as talent_handle,
  t.category as talent_category
from public.deals d
join public.talent t on t.id = d.talent_id;

-- -----------------------------------------------------------------------------
-- deals_with_budget: same budget-aware view, now keyed on company_id.
-- Renaming a column can't go through CREATE OR REPLACE, so drop + recreate.
-- -----------------------------------------------------------------------------
drop view if exists public.deals_with_budget;
create view public.deals_with_budget
with (security_invoker = true) as
select
  d.id,
  d.company_id,
  d.talent_id,
  d.booking_date,
  d.status,
  d.live_url,
  d.notes,
  d.created_at,
  d.updated_at,
  db.budget,
  d.invoice_number
from public.deals d
left join public.deal_budgets db on db.deal_id = d.id;

-- -----------------------------------------------------------------------------
-- Public marketing views: unchanged column shape (so the public site keeps
-- working), just sourced from companies. Brand wall = public companies of
-- type 'brand'. CREATE OR REPLACE keeps the existing grants to anon.
-- -----------------------------------------------------------------------------
create or replace view public.public_brands as
select
  c.id,
  c.name,
  c.logo_url,
  c.website,
  c.category
from public.companies c
where c.is_public = true
  and c.type = 'brand';

create or replace view public.public_talent_partnerships as
select
  d.id,
  d.talent_id,
  c.name     as brand_name,
  c.logo_url as brand_logo_url,
  d.live_url,
  d.booking_date
from public.deals d
join public.talent t    on t.id = d.talent_id
join public.companies c on c.id = d.company_id
where d.status = 'live'
  and d.is_shareable = true
  and t.is_public = true
  and d.live_url is not null;

-- Views need an explicit grant to authenticated; row visibility is still
-- governed by the underlying tables' RLS (security_invoker on the CRM views).
grant select on public.company_overview, public.company_talent, public.deals_with_budget
  to authenticated;
