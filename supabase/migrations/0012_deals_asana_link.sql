-- =============================================================================
-- Tulips Talent — 0012_deals_asana_link.sql
-- Links a deal to the Asana task it was imported from, so the sync can upsert
-- deals (one per per-creator task) idempotently. Nullable + unique so manual
-- deals (NULL) stay valid. Run AFTER 0011. Safe to re-run.
-- =============================================================================

alter table public.deals
  add column if not exists asana_task_gid text
  references public.asana_tasks(gid) on delete set null;

create unique index if not exists uq_deals_asana_task
  on public.deals(asana_task_gid);
