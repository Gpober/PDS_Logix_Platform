-- =============================================================================
-- Tulips Talent CRM — 0036_drop_legacy_brands.sql
-- Retire the brands / agencies / people tables now that everything reads from
-- companies / contacts (0034) and the views were rebuilt (0035).
-- Run LAST. Safe to re-run.
-- =============================================================================

-- Old derived views that still referenced brands / deals.brand_id.
drop view if exists public.brand_overview;
drop view if exists public.brand_talent;

-- Drop the retired tables FIRST. `people` FKs brands/agencies; the brands table
-- also carries a talent-read RLS policy that references deals.brand_id, so it
-- has to go before we can drop that column. Dropping a table takes its policies,
-- grants, indexes and inbound FK constraints (e.g. deals.brand_id -> brands)
-- with it — table rows in `deals` are untouched.
drop table if exists public.people   cascade;
drop table if exists public.agencies cascade;
drop table if exists public.brands   cascade;

-- Finalise deals.company_id and drop the now-orphaned brand column + its index.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'deals'
               and column_name = 'company_id') then
    -- Every deal was backfilled from its (NOT NULL) brand_id in 0034.
    alter table public.deals alter column company_id set not null;
  end if;
end
$$;

drop index if exists public.idx_deals_brand_id;
alter table public.deals drop column if exists brand_id;
