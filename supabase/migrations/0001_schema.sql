-- =============================================================================
-- PDS Logix Platform — 0001_schema.sql
-- Core tables, enums, foreign keys, indexes, profiles + auth trigger.
-- Run this FIRST. Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- Apply via Supabase SQL editor (or psql). RLS policies are in 0002, views in 0003.
--
-- DOMAIN
--   PDS Logix is a vehicle services company with three service lines:
--   Condition Reports (inspections), Detailing (reconditioning), and Biohazard
--   (remediation). Clients hire PDS; each job services one asset (a vehicle) and
--   is performed by a staff member. Pricing is isolated to owner/admin (see 0002).
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto (pre-installed on Supabase, included for portability).
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared helper: keep updated_at fresh on UPDATE.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user, carries the role used by RLS.
-- Self-signup is disabled in Supabase Auth (invite-only); the trigger below
-- still backfills a 'member' profile whenever you create a user.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile (role='member') for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- clients: companies that hire PDS (dealerships, fleets, rental cos, insurers,
-- body shops). The equivalent of a "customer account".
-- -----------------------------------------------------------------------------
create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text,          -- dealership | fleet | rental | insurer | body_shop | other
  website        text,
  billing_email  text,
  phone          text,
  address        text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- contacts: people at a client company (a client's point(s) of contact).
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  title      text,
  client_id  uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- staff: the PDS crew who perform the work — the same person may shoot photos,
-- write condition reports, detail, and handle biohazard jobs.
-- -----------------------------------------------------------------------------
create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  title      text,           -- e.g. Inspector, Detailer, Biohazard Tech, Lead
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- assets: the vehicle being serviced. Belongs to a client (custodian/owner).
-- Vehicle-shaped today; nullable identifiers keep it flexible for other asset
-- types later.
-- -----------------------------------------------------------------------------
create table if not exists public.assets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references public.clients(id) on delete set null,
  asset_type    text not null default 'vehicle',
  vin           text,
  year          integer,
  make          text,
  model         text,
  trim          text,
  color         text,
  mileage       integer,
  license_plate text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_assets_client_id on public.assets(client_id);
create index if not exists idx_assets_vin on public.assets(vin) where vin is not null;

-- -----------------------------------------------------------------------------
-- Enums: service line and job pipeline status. Created idempotently.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_type') then
    create type public.service_type as enum ('condition_report', 'detailing', 'biohazard');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type public.job_status as enum
      ('requested', 'scheduled', 'in_progress', 'completed', 'invoiced');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- jobs: a work order — one service line, on one asset, for one client,
-- performed by one staff member. NOTE: price/cost are NOT here — they live in
-- job_pricing so they can be locked to owner/admin at the row level (see 0002).
-- -----------------------------------------------------------------------------
create table if not exists public.jobs (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  asset_id         uuid references public.assets(id) on delete set null,
  assigned_staff_id uuid references public.staff(id) on delete set null,
  service_type     public.service_type not null,
  status           public.job_status not null default 'requested',
  scheduled_date   date,
  completed_date   date,
  location         text,      -- where the work happens (lot, address, PDS shop)
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- job_pricing: privileged 1:1 extension of jobs. Owner/admin-only via RLS.
-- price = what the client is billed; cost = internal cost to deliver.
-- -----------------------------------------------------------------------------
create table if not exists public.job_pricing (
  job_id     uuid primary key references public.jobs(id) on delete cascade,
  price      numeric(12, 2),
  cost       numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- condition_reports: the structured deliverable for a condition-report job.
-- 1:1 with its job. findings/photos are JSONB so the report shape can evolve
-- without a migration (mirrors the audience_stats JSONB pattern).
--   findings: [{ area, severity, description, cost_estimate }]
--   photos:   [{ url, label, area }]
-- -----------------------------------------------------------------------------
create table if not exists public.condition_reports (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null unique references public.jobs(id) on delete cascade,
  asset_id         uuid references public.assets(id) on delete set null,
  overall_grade    text,          -- excellent | good | fair | poor  (or numeric grade)
  mileage          integer,
  exterior_notes   text,
  interior_notes   text,
  mechanical_notes text,
  findings         jsonb not null default '[]'::jsonb,
  photos           jsonb not null default '[]'::jsonb,
  inspected_by     uuid references public.staff(id) on delete set null,
  inspected_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- updated_at triggers for the entity tables.
-- -----------------------------------------------------------------------------
drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_staff_updated_at on public.staff;
create trigger trg_staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

drop trigger if exists trg_assets_updated_at on public.assets;
create trigger trg_assets_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_job_pricing_updated_at on public.job_pricing;
create trigger trg_job_pricing_updated_at before update on public.job_pricing
  for each row execute function public.set_updated_at();

drop trigger if exists trg_condition_reports_updated_at on public.condition_reports;
create trigger trg_condition_reports_updated_at before update on public.condition_reports
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Indexes for the join + derived-field queries.
-- -----------------------------------------------------------------------------
create index if not exists idx_jobs_client_id      on public.jobs(client_id);
create index if not exists idx_jobs_asset_id       on public.jobs(asset_id);
create index if not exists idx_jobs_staff_id       on public.jobs(assigned_staff_id);
create index if not exists idx_jobs_service_type   on public.jobs(service_type);
create index if not exists idx_jobs_status         on public.jobs(status);
create index if not exists idx_jobs_scheduled_date on public.jobs(scheduled_date desc);
create index if not exists idx_contacts_client_id  on public.contacts(client_id);
create index if not exists idx_condition_reports_job_id on public.condition_reports(job_id);
