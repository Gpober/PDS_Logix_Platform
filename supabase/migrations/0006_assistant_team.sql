-- Zordon's talent-team job queue — the engine room for the Railway worker.
--
-- The web app enqueues a run (one client, or the whole book of business); an
-- always-on worker (worker/) claims it, works Zordon's specialist crew with NO
-- request timeout, and writes results back incrementally. Owner/admin enqueue
-- and read via RLS; the worker connects with the service role (bypasses RLS).

create table if not exists team_runs (
  id          uuid primary key default gen_random_uuid(),
  scope       text not null,                    -- free-text brief describing the ask
  status      text not null default 'queued' check (status in ('queued','running','done','error')),
  results     jsonb not null default '[]'::jsonb,
  error       text,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists team_runs_status_idx on team_runs (status, created_at);
create index if not exists team_runs_created_at_idx on team_runs (created_at desc);

-- Reuse the QBO updated_at trigger fn (defined in 0003_quickbooks.sql).
drop trigger if exists team_runs_set_updated_at on team_runs;
create trigger team_runs_set_updated_at before update on team_runs
  for each row execute function qbo_set_updated_at();

alter table team_runs enable row level security;
drop policy if exists team_runs_oa_all on team_runs;
create policy team_runs_oa_all on team_runs
  for all using (is_owner_admin()) with check (is_owner_admin());
