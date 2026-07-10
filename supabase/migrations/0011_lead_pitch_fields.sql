-- =============================================================================
-- Tulips Talent — 0011_lead_pitch_fields.sql
-- Structured pitch fields on leads, parsed from the Asana task notes by the sync
-- (OWNER / LAST PITCH / NEXT ELIGIBLE / HISTORY / FIT). next_eligible_on powers
-- the "who's due" sort/badge. Run AFTER 0010. Safe to re-run.
-- =============================================================================

alter table public.leads add column if not exists owner text;
alter table public.leads add column if not exists last_pitch_on date;
alter table public.leads add column if not exists last_pitch_text text;
alter table public.leads add column if not exists next_eligible_on date;
alter table public.leads add column if not exists next_eligible_text text;
alter table public.leads add column if not exists history text;
alter table public.leads add column if not exists fit text;

create index if not exists idx_leads_next_eligible on public.leads(next_eligible_on);
