-- =============================================================================
-- Tulips Talent CRM — 0037_analytics.sql
-- Sales-analytics support: a channel/source on each deal (Inbound vs Outbound,
-- and the lead source like LTK / Mavely / Brand Direct), plus an owner-editable
-- targets row that drives the "vs target" and "% of goal" tiles.
-- Additive + safe to re-run. Run AFTER 0036.
-- =============================================================================

-- Per-deal acquisition channel + source. Nullable — existing deals start blank
-- and get classified as they're edited.
alter table public.deals
  add column if not exists channel text
    check (channel is null or channel in ('inbound', 'outbound')),
  add column if not exists source text;

create index if not exists idx_deals_channel on public.deals(channel);

-- -----------------------------------------------------------------------------
-- agency_settings: a single row of agency-wide targets. `default_agency_pct`
-- is the fallback agency commission % used when a talent has no payout_pct set.
-- -----------------------------------------------------------------------------
create table if not exists public.agency_settings (
  id                 integer primary key default 1 check (id = 1),
  monthly_target     numeric,
  annual_goal        numeric,
  default_agency_pct numeric not null default 20,
  updated_at         timestamptz not null default now()
);

insert into public.agency_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_agency_settings_updated_at on public.agency_settings;
create trigger trg_agency_settings_updated_at before update on public.agency_settings
  for each row execute function public.set_updated_at();

grant select, insert, update on public.agency_settings to authenticated;

alter table public.agency_settings enable row level security;

-- Any signed-in team member can read the targets (they show on the analytics
-- header); only owner/admin can change them.
drop policy if exists agency_settings_read on public.agency_settings;
create policy agency_settings_read on public.agency_settings
  for select to authenticated using (true);

drop policy if exists agency_settings_write on public.agency_settings;
create policy agency_settings_write on public.agency_settings
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- Surface channel/source through the budget-aware deals view (appended columns,
-- so CREATE OR REPLACE is fine) for the deal form to prefill.
create or replace view public.deals_with_budget
with (security_invoker = true) as
select
  d.id, d.company_id, d.talent_id, d.booking_date, d.status, d.live_url, d.notes,
  d.created_at, d.updated_at, db.budget, d.invoice_number, d.channel, d.source
from public.deals d
left join public.deal_budgets db on db.deal_id = d.id;
