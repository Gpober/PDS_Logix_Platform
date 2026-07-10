-- =============================================================================
-- Tulips Talent CRM — 0003_views.sql
-- Read views for derived Brand fields and budget-aware deals.
-- Run AFTER 0002. All views use security_invoker = true so the caller's RLS
-- (not the view owner's) decides what they can see — critical for budget.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- brand_overview: the Brand list with the three derived fields computed live.
--   * date_last_booked = most recent booking_date across the brand's deals
--   * latest_live_url  = live_url of the brand's most recent deal
-- deal_count is a convenience extra. Nothing here is a stored column.
-- -----------------------------------------------------------------------------
create or replace view public.brand_overview
with (security_invoker = true) as
select
  b.id,
  b.name,
  b.category,
  b.employee_count,
  b.website,
  b.created_at,
  b.updated_at,
  (
    select max(d.booking_date)
    from public.deals d
    where d.brand_id = b.id
  ) as date_last_booked,
  (
    select d.live_url
    from public.deals d
    where d.brand_id = b.id
    order by d.booking_date desc nulls last, d.created_at desc
    limit 1
  ) as latest_live_url,
  (
    select count(*)
    from public.deals d
    where d.brand_id = b.id
  ) as deal_count
from public.brands b;

-- -----------------------------------------------------------------------------
-- brand_talent: distinct talent each brand has worked with (the related list
-- for "Talent worked with"). One row per (brand, talent) pair.
-- -----------------------------------------------------------------------------
create or replace view public.brand_talent
with (security_invoker = true) as
select distinct
  d.brand_id,
  t.id       as talent_id,
  t.name     as talent_name,
  t.handle   as talent_handle,
  t.category as talent_category
from public.deals d
join public.talent t on t.id = d.talent_id;

-- -----------------------------------------------------------------------------
-- deals_with_budget: deals + budget in one place. Because the view is
-- security_invoker, the LEFT JOIN to deal_budgets is evaluated as the CALLER:
--   * owner/admin  -> joined row visible    -> budget populated
--   * member       -> joined row filtered by RLS -> budget is NULL
-- Both roles query the same view; the database decides. Read-only — write
-- budget through the deal_budgets table directly (owner/admin only).
-- -----------------------------------------------------------------------------
create or replace view public.deals_with_budget
with (security_invoker = true) as
select
  d.id,
  d.brand_id,
  d.talent_id,
  d.booking_date,
  d.status,
  d.live_url,
  d.notes,
  d.created_at,
  d.updated_at,
  db.budget
from public.deals d
left join public.deal_budgets db on db.deal_id = d.id;

-- Views need an explicit grant; row visibility is still governed by the
-- underlying tables' RLS (security_invoker).
grant select on public.brand_overview, public.brand_talent, public.deals_with_budget
  to authenticated;
