-- =============================================================================
-- Tulips Talent — 0007_asana.sql  (Asana import)
-- Mirrors Asana projects + tasks into Supabase so the CRM can read them. Rows
-- are keyed by Asana GID and written via upsert, so re-running a sync is
-- idempotent. Staff read-only under RLS; writes happen out-of-band (service
-- role during import), never from the anon/user role. Run AFTER 0001–0006.
-- =============================================================================

create table if not exists public.asana_projects (
  gid                  text primary key,
  name                 text,
  archived             boolean,
  team_gid             text,
  owner_gid            text,
  owner_name           text,
  num_tasks            integer,
  num_completed_tasks  integer,
  num_incomplete_tasks integer,
  created_at           timestamptz,
  synced_at            timestamptz not null default now()
);

create table if not exists public.asana_tasks (
  gid           text primary key,
  project_gid   text references public.asana_projects(gid) on delete cascade,
  name          text,
  notes         text,
  completed     boolean,
  assignee_gid  text,
  assignee_name text,
  due_on        date,
  permalink_url text,
  created_at    timestamptz,
  modified_at   timestamptz,
  synced_at     timestamptz not null default now()
);

create index if not exists idx_asana_tasks_project on public.asana_tasks(project_gid);

alter table public.asana_projects enable row level security;
alter table public.asana_tasks enable row level security;

-- Staff may read the mirror and run the sync (upsert) as themselves.
drop policy if exists asana_projects_staff_read on public.asana_projects;
drop policy if exists asana_projects_staff_all on public.asana_projects;
create policy asana_projects_staff_all on public.asana_projects
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists asana_tasks_staff_read on public.asana_tasks;
drop policy if exists asana_tasks_staff_all on public.asana_tasks;
create policy asana_tasks_staff_all on public.asana_tasks
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
