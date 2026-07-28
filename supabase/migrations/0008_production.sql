-- Production log: one row per unit serviced (Connecteam "Entries" export) —
-- who, when, VIN, model, service type, location. Backfills historical volume
-- and (going forward) is where production is recorded natively.
create table if not exists production_entries (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  location text not null,
  staff_name text,
  staff_id uuid references staff (id) on delete set null,
  submitted_at timestamptz,
  service_type text,
  vehicle_year int,
  vin_last6 text,
  model_type text,
  capture text,
  work_order_number text,
  note text,
  status text,
  source text not null default 'connecteam',
  created_at timestamptz not null default now()
);
create unique index if not exists production_entries_external_uq
  on production_entries (location, external_id) where external_id is not null;
create index if not exists production_entries_loc_date_idx on production_entries (location, submitted_at);
create index if not exists production_entries_service_idx on production_entries (service_type);
create index if not exists production_entries_staff_idx on production_entries (staff_id);
create index if not exists production_entries_vin_idx on production_entries (vin_last6);

alter table production_entries enable row level security;
drop policy if exists production_entries_team_all on production_entries;
create policy production_entries_team_all on production_entries
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')));

-- Aggregate summary (totals + breakdowns by location / service / person / month / day).
create or replace function get_production_summary(p_location text default null, p_from date default null, p_to date default null)
returns jsonb
language sql
stable
as $$
  with base as (
    select * from production_entries
    where (p_location is null or location = p_location)
      and (p_from is null or submitted_at >= p_from)
      and (p_to is null or submitted_at < (p_to + 1))
  )
  select jsonb_build_object(
    'total_units', (select count(*) from base),
    'date_from', (select min(submitted_at)::date from base),
    'date_to', (select max(submitted_at)::date from base),
    'locations', (select coalesce(jsonb_agg(jsonb_build_object('location', location, 'units', n) order by n desc), '[]'::jsonb) from (select location, count(*) n from base group by location) x),
    'by_service', (select coalesce(jsonb_agg(jsonb_build_object('service_type', service_type, 'units', n) order by n desc), '[]'::jsonb) from (select service_type, count(*) n from base group by service_type) x),
    'by_staff', (select coalesce(jsonb_agg(jsonb_build_object('staff', staff_name, 'units', n) order by n desc), '[]'::jsonb) from (select staff_name, count(*) n from base group by staff_name) x),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'units', n) order by m), '[]'::jsonb) from (select to_char(submitted_at, 'YYYY-MM') m, count(*) n from base group by 1) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d::text, 'units', n) order by d), '[]'::jsonb) from (select submitted_at::date d, count(*) n from base group by 1) x)
  );
$$;
grant execute on function get_production_summary(text, date, date) to authenticated, anon;
