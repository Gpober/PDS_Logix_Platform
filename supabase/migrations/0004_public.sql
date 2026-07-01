-- =============================================================================
-- PDS Logix Platform — 0004_public.sql  (PHASE 2: public website surface)
-- Adds public-facing flags/fields, a leads table, and the ONLY things the
-- anonymous (public) Supabase role may ever read: two curated views.
-- Run AFTER 0001–0003. Safe to re-run.
--
-- EXPOSURE MODEL (anon / public key)
--   * Base tables remain fully UNGRANTED to anon (set in 0002). The public key
--     literally cannot select clients/jobs/job_pricing/contacts/assets/profiles.
--   * The public surface is SECURITY DEFINER views that expose an explicit
--     safe-column list and filter to opted-in rows (is_public / is_shareable).
--     Sensitive columns (price, cost, notes, VINs, emails, phones) are not
--     present in anything anon can query, so they cannot leak.
--   * leads is write-only for anon: INSERT allowed via RLS, SELECT never granted.
--   * All new flags default FALSE — nothing is public until opted in from the CRM.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Public-facing columns on existing entities.
-- -----------------------------------------------------------------------------
alter table public.clients
  add column if not exists logo_url  text,
  add column if not exists is_public boolean not null default false;

create index if not exists idx_clients_is_public on public.clients(is_public)
  where is_public;

-- A completed job may be opted-in as a portfolio / "recent work" item.
alter table public.jobs
  add column if not exists is_shareable boolean not null default false,
  add column if not exists summary      text,
  add column if not exists cover_photo_url text;

create index if not exists idx_jobs_shareable on public.jobs(service_type)
  where is_shareable and status in ('completed', 'invoiced');

-- -----------------------------------------------------------------------------
-- leads: inbound "Request a quote" submissions from the public site.
-- -----------------------------------------------------------------------------
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  phone        text,
  company      text,
  service_type text,          -- which service line they're interested in (free text)
  message      text,
  source       text not null default 'website',
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- PUBLIC VIEWS  (the entire public read surface)
-- These are SECURITY DEFINER (default — no security_invoker). They run with the
-- owner's rights, so anon can read them WITHOUT any base-table grant; the
-- column list and WHERE clause are the single source of truth for what's public.
-- =============================================================================

-- Public client wall ("Trusted by"). Excludes billing info and internal fields.
create or replace view public.public_clients as
select
  c.id,
  c.name,
  c.logo_url,
  c.website,
  c.category
from public.clients c
where c.is_public = true;

-- Public "recent work" / portfolio. Opted-in completed jobs only. No pricing,
-- no VIN, no client billing details — just the service line and a summary.
create or replace view public.public_work as
select
  j.id,
  j.service_type,
  j.summary,
  j.cover_photo_url,
  j.completed_date,
  c.name     as client_name,
  c.logo_url as client_logo_url
from public.jobs j
join public.clients c on c.id = j.client_id
where j.is_shareable = true
  and j.status in ('completed', 'invoiced');

-- -----------------------------------------------------------------------------
-- GRANTS
--   Public surface: SELECT on the two views only (never the base tables).
--   leads: anon may INSERT specific columns only, and may NOT select.
-- -----------------------------------------------------------------------------
grant usage on schema public to anon;

grant select on
  public.public_clients,
  public.public_work
  to anon, authenticated;

grant insert (name, email, phone, company, service_type, message, source)
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
