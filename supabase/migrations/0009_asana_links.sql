-- =============================================================================
-- Tulips Talent — 0009_asana_links.sql
-- Links CRM records to their Asana source: a Talent to their per-creator Asana
-- project, and a Lead to the Asana task it was imported from. Both nullable and
-- ON DELETE SET NULL so removing Asana rows never deletes CRM records. Run AFTER
-- 0007/0008 (asana tables). Safe to re-run.
-- =============================================================================

alter table public.talent
  add column if not exists asana_project_gid text
  references public.asana_projects(gid) on delete set null;

alter table public.leads
  add column if not exists asana_task_gid text
  references public.asana_tasks(gid) on delete set null;

create index if not exists idx_talent_asana_project on public.talent(asana_project_gid);
