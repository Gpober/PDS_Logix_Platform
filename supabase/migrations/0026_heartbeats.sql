-- The heartbeat's log.
--
-- Every run is recorded, including the runs that decided nothing was worth
-- saying. A loop that only writes when it has news is a loop you cannot audit:
-- a quiet week and a stopped cron look identical from the outside.
--
-- Applied to the live project; this file mirrors it.

create table if not exists public.heartbeats (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),

  -- Did this beat decide the owner should look at something?
  notable boolean not null default false,

  -- The brief. Null on a silent beat.
  headline text,
  one_thing text,
  hand_off text[] not null default '{}',
  ignore_list text[] not null default '{}',
  watch text,

  -- The signals the judgment was made from, exactly as computed. Kept so a
  -- brief can always be checked against the facts that produced it.
  signals jsonb not null default '[]'::jsonb,

  -- 'silent_no_signals' short-circuits before the model is called at all.
  outcome text not null check (outcome in ('notable', 'silent', 'silent_no_signals', 'error')),
  error text,

  -- Whether a human has seen it.
  acknowledged_at timestamptz
);

create index if not exists heartbeats_ran_at_idx on public.heartbeats (ran_at desc);
create index if not exists heartbeats_unread_idx on public.heartbeats (ran_at desc) where notable and acknowledged_at is null;

alter table public.heartbeats enable row level security;

-- Readable by any signed-in member of the CRM; written only by the service
-- role (the cron), never from the browser.
drop policy if exists heartbeats_read on public.heartbeats;
create policy heartbeats_read on public.heartbeats
  for select to authenticated using (true);

comment on table public.heartbeats is
  'One row per heartbeat run, including silent ones — see app/api/cron/heartbeat.';
