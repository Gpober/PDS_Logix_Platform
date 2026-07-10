-- PDS Logix CRM — schema
-- Vehicle field-service business: condition-report inspections, detailing, and
-- biohazard remediation for dealers, fleets, and insurers.
--
-- This mirrors the deployed Supabase project (the live database is the source of
-- truth). Apply in order: 0001_schema.sql then 0002_rls.sql.

create extension if not exists "pgcrypto";

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type service_type as enum ('condition_report', 'detailing', 'biohazard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('requested', 'scheduled', 'in_progress', 'completed', 'invoiced');
exception when duplicate_object then null; end $$;

-- updated_at helper -----------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Profiles (one per auth user) ------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  role        text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- New signups automatically get a member profile.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Clients (dealers, fleets, insurers) -----------------------------------------
create table if not exists clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text,
  website       text,
  billing_email text,
  phone         text,
  address       text,
  notes         text,
  logo_url      text,
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists contacts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  title      text,
  client_id  uuid not null references clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Staff (technicians / inspectors) --------------------------------------------
create table if not exists staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  phone      text,
  title      text,
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Assets (the vehicles we service) --------------------------------------------
create table if not exists assets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients (id) on delete set null,
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

-- Jobs (a unit of work for a client on an asset) ------------------------------
create table if not exists jobs (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients (id) on delete cascade,
  asset_id          uuid references assets (id) on delete set null,
  assigned_staff_id uuid references staff (id) on delete set null,
  service_type      service_type not null,
  status            job_status not null default 'requested',
  scheduled_date    date,
  completed_date    date,
  location          text,
  notes             text,
  summary           text,
  cover_photo_url   text,
  is_shareable      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists job_pricing (
  job_id     uuid primary key references jobs (id) on delete cascade,
  price      numeric,
  cost       numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists condition_reports (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid not null unique references jobs (id) on delete cascade,
  asset_id        uuid references assets (id) on delete set null,
  overall_grade   text,
  mileage         integer,
  exterior_notes  text,
  interior_notes  text,
  mechanical_notes text,
  findings        jsonb not null default '[]'::jsonb,
  photos          jsonb not null default '[]'::jsonb,
  inspected_by    uuid references staff (id) on delete set null,
  inspected_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Inbound leads (public "request service" form) -------------------------------
create table if not exists leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  phone        text,
  company      text,
  service_type text,
  message      text,
  source       text not null default 'website',
  created_at   timestamptz not null default now()
);

-- Indexes ---------------------------------------------------------------------
create index if not exists contacts_client_id_idx  on contacts (client_id);
create index if not exists assets_client_id_idx     on assets (client_id);
create index if not exists jobs_client_id_idx        on jobs (client_id);
create index if not exists jobs_status_idx           on jobs (status);
create index if not exists jobs_assigned_staff_idx   on jobs (assigned_staff_id);

-- updated_at triggers ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','clients','contacts','staff','assets','jobs','job_pricing','condition_reports']
  loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;
