-- =============================================================================
-- Tulips Talent — 0013_deal_financials.sql
-- Invoice number + a link to the income-tracker task on deals. Dollar amounts
-- live in deal_financials (0014), not here. Run AFTER 0012. Safe to re-run.
-- =============================================================================

alter table public.deals add column if not exists invoice_number text;
alter table public.deals add column if not exists income_task_gid text;

create unique index if not exists uq_deals_income_task on public.deals(income_task_gid);
