-- =============================================================================
-- Tulips Talent — 0028_follower_snapshots.sql
-- Records a daily snapshot of each account's follower count so the analytics
-- tab can chart growth over time. talent_accounts only holds the *latest* count;
-- this table accumulates history. Written nightly by the daily maintenance cron
-- (service role), read by staff (all) and each creator (their own).
-- Run AFTER 0027. Safe to re-run.
-- =============================================================================

create table if not exists public.follower_snapshots (
  id          uuid primary key default gen_random_uuid(),
  talent_id   uuid not null references public.talent(id) on delete cascade,
  account_id  uuid references public.talent_accounts(id) on delete cascade,
  platform    text,
  followers   integer not null default 0,
  captured_on date not null default (now() at time zone 'utc')::date,
  created_at  timestamptz not null default now(),
  -- one row per account per day; the cron upserts on this so a re-run just
  -- overwrites the day's value instead of duplicating it.
  unique (account_id, captured_on)
);

create index if not exists idx_follower_snapshots_talent
  on public.follower_snapshots (talent_id, captured_on);

alter table public.follower_snapshots enable row level security;

-- Staff see everyone's history.
drop policy if exists follower_snap_staff on public.follower_snapshots;
create policy follower_snap_staff on public.follower_snapshots
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- A creator sees only their own.
drop policy if exists follower_snap_self on public.follower_snapshots;
create policy follower_snap_self on public.follower_snapshots
  for select to authenticated
  using (talent_id = public.current_talent_id());

grant select on public.follower_snapshots to authenticated;
