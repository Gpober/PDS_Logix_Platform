-- =============================================================================
-- PDS Logix Platform — 0003_views.sql
-- Read views for derived Client fields and pricing-aware jobs.
-- Run AFTER 0002. All views use security_invoker = true so the caller's RLS
-- (not the view owner's) decides what they can see — critical for price/cost.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- client_overview: the Client list with derived fields computed live.
--   * date_last_serviced = most recent completed/scheduled date across jobs
--   * open_job_count     = jobs not yet completed/invoiced
--   * job_count          = total jobs
-- Nothing here is a stored column.
-- -----------------------------------------------------------------------------
create or replace view public.client_overview
with (security_invoker = true) as
select
  c.id,
  c.name,
  c.category,
  c.website,
  c.billing_email,
  c.phone,
  c.created_at,
  c.updated_at,
  (
    select max(coalesce(j.completed_date, j.scheduled_date))
    from public.jobs j
    where j.client_id = c.id
  ) as date_last_serviced,
  (
    select count(*)
    from public.jobs j
    where j.client_id = c.id
      and j.status not in ('completed', 'invoiced')
  ) as open_job_count,
  (
    select count(*)
    from public.jobs j
    where j.client_id = c.id
  ) as job_count
from public.clients c;

-- -----------------------------------------------------------------------------
-- client_staff: distinct staff who have worked a client's jobs (the related
-- list for "Team who serviced this account"). One row per (client, staff).
-- -----------------------------------------------------------------------------
create or replace view public.client_staff
with (security_invoker = true) as
select distinct
  j.client_id,
  s.id    as staff_id,
  s.name  as staff_name,
  s.title as staff_title
from public.jobs j
join public.staff s on s.id = j.assigned_staff_id;

-- -----------------------------------------------------------------------------
-- jobs_with_pricing: jobs + price/cost in one place. Because the view is
-- security_invoker, the LEFT JOIN to job_pricing is evaluated as the CALLER:
--   * owner/admin  -> joined row visible         -> price/cost populated
--   * member       -> joined row filtered by RLS -> price/cost are NULL
-- Both roles query the same view; the database decides. Read-only — write
-- pricing through the job_pricing table directly (owner/admin only).
-- -----------------------------------------------------------------------------
create or replace view public.jobs_with_pricing
with (security_invoker = true) as
select
  j.id,
  j.client_id,
  j.asset_id,
  j.assigned_staff_id,
  j.service_type,
  j.status,
  j.scheduled_date,
  j.completed_date,
  j.location,
  j.notes,
  j.created_at,
  j.updated_at,
  p.price,
  p.cost
from public.jobs j
left join public.job_pricing p on p.job_id = j.id;

-- Views need an explicit grant; row visibility is still governed by the
-- underlying tables' RLS (security_invoker).
grant select on public.client_overview, public.client_staff, public.jobs_with_pricing
  to authenticated;
