-- =============================================================================
-- Tulips Talent CRM — 0001_schema.sql
-- Core tables, enums, foreign keys, indexes, profiles + auth trigger.
-- Run this FIRST. Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- Apply via Supabase SQL editor (or psql). RLS policies are in 0002, views in 0003.
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
-- Core CRM entities.
-- -----------------------------------------------------------------------------
create table if not exists public.brands (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text,
  employee_count integer,
  website        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.agencies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  website    text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talent (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  handle     text,
  category   text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A person belongs to a brand OR an agency (at least one is required).
create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  title      text,
  brand_id   uuid references public.brands(id) on delete set null,
  agency_id  uuid references public.agencies(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_linked_to_one check (brand_id is not null or agency_id is not null)
);

-- deal_status drives the pipeline. Created idempotently.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_status') then
    create type public.deal_status as enum ('pitched', 'confirmed', 'live', 'completed');
  end if;
end
$$;

-- deals: the join between brands and talent. NOTE: budget is NOT here — it lives
-- in deal_budgets so it can be locked to owner/admin at the row level (see 0002).
create table if not exists public.deals (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  talent_id    uuid not null references public.talent(id) on delete cascade,
  booking_date date,
  status       public.deal_status not null default 'pitched',
  live_url     text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- deal_budgets: privileged 1:1 extension of deals. Owner/admin-only via RLS.
create table if not exists public.deal_budgets (
  deal_id    uuid primary key references public.deals(id) on delete cascade,
  budget     numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers for the entity tables.
drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at before update on public.brands
  for each row execute function public.set_updated_at();

drop trigger if exists trg_agencies_updated_at on public.agencies;
create trigger trg_agencies_updated_at before update on public.agencies
  for each row execute function public.set_updated_at();

drop trigger if exists trg_talent_updated_at on public.talent;
create trigger trg_talent_updated_at before update on public.talent
  for each row execute function public.set_updated_at();

drop trigger if exists trg_people_updated_at on public.people;
create trigger trg_people_updated_at before update on public.people
  for each row execute function public.set_updated_at();

drop trigger if exists trg_deals_updated_at on public.deals;
create trigger trg_deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();

drop trigger if exists trg_deal_budgets_updated_at on public.deal_budgets;
create trigger trg_deal_budgets_updated_at before update on public.deal_budgets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Indexes for the join + derived-field queries.
-- -----------------------------------------------------------------------------
create index if not exists idx_deals_brand_id     on public.deals(brand_id);
create index if not exists idx_deals_talent_id    on public.deals(talent_id);
create index if not exists idx_deals_booking_date on public.deals(booking_date desc);
create index if not exists idx_people_brand_id    on public.people(brand_id);
create index if not exists idx_people_agency_id   on public.people(agency_id);
