-- =============================================================================
-- Tulips Talent CRM — 0004_public.sql  (PHASE 2: public website surface)
-- Adds public-facing flags/fields, a leads table, and the ONLY things the
-- anonymous (public) Supabase role may ever read: three curated views.
-- Run AFTER 0001–0003. Safe to re-run.
--
-- EXPOSURE MODEL (anon / public key)
--   * Base tables remain fully UNGRANTED to anon (set in 0002). The public key
--     literally cannot select brands/talent/deals/deal_budgets/people/profiles.
--   * The public surface is three SECURITY DEFINER views that expose an explicit
--     safe-column list and filter to opted-in rows (is_public / is_shareable).
--     Sensitive columns (notes, budget, employee_count, emails, phones) are not
--     present in anything anon can query, so they cannot leak.
--   * leads is write-only for anon: INSERT allowed via RLS, SELECT never granted.
--   * All new flags default FALSE — nothing is public until opted in from the CRM.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Public-facing columns on existing entities.
-- -----------------------------------------------------------------------------
alter table public.talent
  add column if not exists is_public      boolean not null default false,
  add column if not exists is_featured    boolean not null default false,
  add column if not exists slug           text,
  add column if not exists bio            text,
  add column if not exists headshot_url   text,
  add column if not exists location       text,
  add column if not exists audience_stats jsonb not null default '{}'::jsonb;

-- Pretty, stable profile URLs (/talent/<slug>). Unique but nullable.
create unique index if not exists idx_talent_slug on public.talent(slug)
  where slug is not null;

create index if not exists idx_talent_is_public on public.talent(is_public)
  where is_public;

alter table public.brands
  add column if not exists logo_url  text,
  add column if not exists is_public boolean not null default false;

create index if not exists idx_brands_is_public on public.brands(is_public)
  where is_public;

alter table public.deals
  add column if not exists is_shareable boolean not null default false;

create index if not exists idx_deals_shareable_live on public.deals(talent_id)
  where is_shareable and status = 'live';

-- -----------------------------------------------------------------------------
-- leads: inbound "Work with us" submissions from the public site.
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  email              text not null,
  company            text,
  message            text,
  talent_of_interest text,
  source             text not null default 'website',
  created_at         timestamptz not null default now()
);

-- =============================================================================
-- PUBLIC VIEWS  (the entire public read surface)
-- These are SECURITY DEFINER (default — no security_invoker). They run with the
-- owner's rights, so anon can read them WITHOUT any base-table grant; the
-- column list and WHERE clause are the single source of truth for what's public.
-- =============================================================================

-- Public talent directory / profiles. Excludes notes and all internal fields.
create or replace view public.public_talent as
select
  t.id,
  t.slug,
  t.name,
  t.handle,
  t.category,
  t.bio,
  t.headshot_url,
  t.location,
  t.audience_stats,
  t.is_featured
from public.talent t
where t.is_public = true;

-- Public brand wall. Excludes employee_count and internal fields.
create or replace view public.public_brands as
select
  b.id,
  b.name,
  b.logo_url,
  b.website,
  b.category
from public.brands b
where b.is_public = true;

-- Live, shareable partnerships per (public) talent. No budget, no notes.
create or replace view public.public_talent_partnerships as
select
  d.id,
  d.talent_id,
  b.name     as brand_name,
  b.logo_url as brand_logo_url,
  d.live_url,
  d.booking_date
from public.deals d
join public.talent t on t.id = d.talent_id
join public.brands b on b.id = d.brand_id
where d.status = 'live'
  and d.is_shareable = true
  and t.is_public = true
  and d.live_url is not null;

-- -----------------------------------------------------------------------------
-- GRANTS
--   Public surface: SELECT on the three views only (never the base tables).
--   leads: anon may INSERT specific columns only, and may NOT select.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon;

grant select on
  public.public_talent,
  public.public_brands,
  public.public_talent_partnerships
  to anon, authenticated;

grant insert (name, email, company, message, talent_of_interest, source)
  on public.leads to anon;

grant select, insert, update, delete on public.leads to authenticated;

-- -----------------------------------------------------------------------------
-- RLS on leads: public can submit, only the team can read.
-- -----------------------------------------------------------------------------
alter table public.leads enable row level security;

drop policy if exists leads_insert_anon on public.leads;
create policy leads_insert_anon on public.leads
  for insert to anon
  with check (true);

drop policy if exists leads_team_all on public.leads;
create policy leads_team_all on public.leads
  for all to authenticated
  using (true)
  with check (true);
