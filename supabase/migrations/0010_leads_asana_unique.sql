-- =============================================================================
-- Tulips Talent — 0010_leads_asana_unique.sql
-- Lets the Asana sync upsert leads by their source task. A plain unique index on
-- a nullable column keeps multiple website leads (NULL asana_task_gid) valid
-- while enforcing one lead per Asana task. Run AFTER 0009. Safe to re-run.
-- =============================================================================

create unique index if not exists uq_leads_asana_task
  on public.leads(asana_task_gid);
