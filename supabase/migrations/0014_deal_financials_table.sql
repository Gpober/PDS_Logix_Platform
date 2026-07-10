-- =============================================================================
-- Tulips Talent — 0014_deal_financials_table.sql
-- Owner-only dollar breakdown for a deal (gross/influencer/manager/taxes/net +
-- contact email), mirroring the deal_budgets isolation so members never receive
-- it. Invoice number stays on deals (not a dollar value) and is surfaced through
-- the deals view. Run AFTER 0013. Safe to re-run.
-- =============================================================================

create table if not exists public.deal_financials (
  deal_id       uuid primary key references public.deals(id) on delete cascade,
  gross         numeric,
  influencer    numeric,
  manager       numeric,
  taxes         numeric,
  net           numeric,
  contact_email text,
  updated_at    timestamptz not null default now()
);

alter table public.deal_financials enable row level security;

drop policy if exists deal_financials_owner on public.deal_financials;
create policy deal_financials_owner on public.deal_financials
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create or replace view public.deals_with_budget as
  select d.id, d.brand_id, d.talent_id, d.booking_date, d.status, d.live_url,
         d.notes, d.created_at, d.updated_at, db.budget, d.invoice_number
  from public.deals d
  left join public.deal_budgets db on db.deal_id = d.id;
