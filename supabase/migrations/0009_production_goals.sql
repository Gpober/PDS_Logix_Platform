-- Monthly production targets. location null = company-wide; period ('YYYY-MM')
-- null = the default target that applies to every month unless a month-specific
-- goal overrides it. Resolution: (loc,month) > (loc,default) > (company,month)
-- > (company,default).
create table if not exists production_goals (
  id uuid primary key default gen_random_uuid(),
  location text,
  period text,
  target_units int not null check (target_units >= 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists production_goals_scope_uq
  on production_goals (coalesce(location, ''), coalesce(period, ''));

alter table production_goals enable row level security;
drop policy if exists production_goals_team_all on production_goals;
create policy production_goals_team_all on production_goals
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')));
