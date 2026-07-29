-- Manual layer on top of the auto-computed cash forecast: an optional anchor
-- override and ad-hoc per-week adjustments (expected in/out the books don't know
-- about yet). Editable in-app (phone) and, later, from a synced Google Sheet.

-- Singleton settings row (this platform serves one company).
create table if not exists forecast_settings (
  id              text primary key default 'singleton' check (id = 'singleton'),
  anchor_override numeric,          -- if set, overrides the snapshot starting cash
  google_sheet_id text,
  google_sheet_url text,
  sheet_synced_at timestamptz,
  updated_at      timestamptz not null default now()
);
insert into forecast_settings (id) values ('singleton') on conflict (id) do nothing;

-- One row per manual adjustment. amount is SIGNED: positive = money in, negative
-- = money out. week_ending is the Friday of the forecast week it lands in.
create table if not exists forecast_adjustments (
  id          uuid primary key default gen_random_uuid(),
  week_ending date not null,
  label       text,
  amount      numeric not null,
  source      text not null default 'app', -- app | sheet
  created_at  timestamptz not null default now()
);
create index if not exists forecast_adjustments_week_idx on forecast_adjustments (week_ending);

alter table forecast_settings enable row level security;
alter table forecast_adjustments enable row level security;

drop policy if exists forecast_settings_rw on forecast_settings;
create policy forecast_settings_rw on forecast_settings for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin')));

drop policy if exists forecast_adjustments_rw on forecast_adjustments;
create policy forecast_adjustments_rw on forecast_adjustments for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin')));
