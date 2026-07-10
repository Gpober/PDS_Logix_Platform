-- =============================================================================
-- Tulips Talent CRM — 0034_companies_contacts.sql
-- Collapse brands + agencies into a single `companies` table, and `people`
-- into `contacts` that live inside a company (AA Top Talent–style model).
--
-- This migration is ADDITIVE and backfills data. It creates the new tables,
-- copies every brand/agency/person across (preserving their UUIDs), and points
-- deals at their company via a new deals.company_id column. The old tables,
-- columns and views are removed later in 0036 once the new views (0035) exist.
--
-- Run AFTER 0001–0033. Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- companies: every organisation we work with. `type` keeps the old brand vs
-- agency distinction (filterable), `status` mirrors the AA pipeline states.
-- brand-only public-site columns (logo_url, is_public) ride along so the
-- marketing wall keeps working unchanged.
-- -----------------------------------------------------------------------------
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null default 'brand' check (type in ('brand', 'agency', 'other')),
  category        text,
  employee_count  integer,
  website         text,
  notes           text,
  status          text not null default 'active' check (status in ('active', 'prospect', 'inactive')),
  logo_url        text,
  is_public       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- contacts: a person who works at a company. Replaces `people`; the old
-- brand_id / agency_id pair collapses to a single company_id.
-- -----------------------------------------------------------------------------
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  title      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

create index if not exists idx_companies_type       on public.companies(type);
create index if not exists idx_companies_status      on public.companies(status);
create index if not exists idx_companies_is_public   on public.companies(is_public) where is_public;
create index if not exists idx_contacts_company_id   on public.contacts(company_id);

-- -----------------------------------------------------------------------------
-- Backfill. UUIDs are preserved so deals.brand_id == companies.id for brands,
-- and any external reference to a brand/agency/person id keeps resolving.
-- Guarded by IF EXISTS so a fresh database (where these tables were never
-- created) and a re-run both no-op cleanly.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'brands') then
    insert into public.companies
      (id, name, type, category, employee_count, website, logo_url, is_public,
       created_at, updated_at)
    select id, name, 'brand', category, employee_count, website, logo_url, is_public,
           created_at, updated_at
    from public.brands
    on conflict (id) do nothing;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'agencies') then
    insert into public.companies (id, name, type, website, notes, created_at, updated_at)
    select id, name, 'agency', website, notes, created_at, updated_at
    from public.agencies
    on conflict (id) do nothing;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'people') then
    -- A person linked to both a brand and an agency collapses onto the brand.
    insert into public.contacts (id, company_id, name, email, phone, title, created_at, updated_at)
    select p.id, coalesce(p.brand_id, p.agency_id), p.name, p.email, p.phone, p.title,
           p.created_at, p.updated_at
    from public.people p
    where coalesce(p.brand_id, p.agency_id) is not null
    on conflict (id) do nothing;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- deals.company_id: the deal's company. Backfilled from brand_id (same UUID).
-- Left nullable here; 0036 makes it NOT NULL and drops brand_id once the views
-- that still read brand_id have been rebuilt (0035).
-- -----------------------------------------------------------------------------
alter table public.deals
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'deals'
               and column_name = 'brand_id') then
    update public.deals set company_id = brand_id where company_id is null;
  end if;
end
$$;

create index if not exists idx_deals_company_id on public.deals(company_id);

-- -----------------------------------------------------------------------------
-- Grants + RLS: same access model as the tables they replace — every signed-in
-- team member has full read/write; anon gets nothing (public reads still go
-- through the SECURITY DEFINER views only).
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on public.companies, public.contacts to authenticated;

alter table public.companies enable row level security;
alter table public.contacts  enable row level security;

drop policy if exists companies_all on public.companies;
create policy companies_all on public.companies
  for all to authenticated using (true) with check (true);

drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts
  for all to authenticated using (true) with check (true);
