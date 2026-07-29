-- Weekly cash anchor: the previous Friday's end-of-day balance, captured once
-- that Friday has closed (first forecast load on/after Saturday) and locked for
-- the week. Plaid only exposes a live balance, so we snapshot it here and roll to
-- the new Friday on Saturday. One row per anchor Friday.
create table if not exists cash_balance_snapshots (
  friday_date date primary key,
  balance     numeric not null,
  source      text    not null default 'plaid', -- plaid | books | manual
  captured_at timestamptz not null default now(),
  note        text
);

alter table cash_balance_snapshots enable row level security;
drop policy if exists cash_snapshots_team on cash_balance_snapshots;
create policy cash_snapshots_team on cash_balance_snapshots
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin')));
