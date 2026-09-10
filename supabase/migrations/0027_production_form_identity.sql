-- Production congruency, part 1: give every entry the identity of the Connecteam
-- form it came from, and make form coverage an explicit, dated roster.
--
-- Two defects this closes:
--
--  1. Entries were keyed by (location, external_id). Connecteam's entry number
--     ("#") is unique per FORM, not per location, and a submission's location
--     answer can change — so the same unit could land twice under two spellings
--     of its location, and two forms that resolved to one location could
--     silently drop each other's units. (form_id, external_id) is the identity
--     Connecteam actually guarantees.
--
--  2. The sync's form list was hardcoded to three forms in application code, so
--     ~30 other Connecteam locations were invisible. The roster below makes
--     coverage data, discoverable at sync time — and each form carries the date
--     it starts counting, so switching a new location on never rewrites a
--     payroll period that has already been reported.

alter table production_entries add column if not exists form_id text;

-- Every connecteam-sourced row to date came from one of the three hardcoded
-- forms, so its location identifies its form exactly.
update production_entries set form_id = '4875728' where form_id is null and source = 'connecteam' and location = 'Manheim Dallas';
update production_entries set form_id = '4918561' where form_id is null and source = 'connecteam' and location = 'Manheim Atlanta';
update production_entries set form_id = '6073028' where form_id is null and source = 'connecteam' and location = 'Manheim Tampa';

-- The identity the sync upserts on. Partial, so xlsx-imported rows (no form)
-- stay covered by the older (location, external_id) index instead.
create unique index if not exists production_entries_form_uq
  on production_entries (form_id, external_id)
  where form_id is not null and external_id is not null;

create index if not exists production_entries_form_date_idx
  on production_entries (form_id, submitted_at);

-- The roster of Connecteam forms that count as production.
create table if not exists production_forms (
  form_id       text primary key,
  name          text,
  -- Entries submitted before this date are ignored by both the live read and
  -- the sync. A form discovered today starts counting today, which is what
  -- keeps already-reported totals from moving underneath payroll.
  active_from   date not null default current_date,
  enabled       boolean not null default true,
  discovered_at timestamptz not null default now(),
  last_synced_at timestamptz,
  note          text
);

-- The three forms that have been syncing all along carry full history.
insert into production_forms (form_id, name, active_from, note) values
  ('4875728', 'Manheim Dallas',  date '2000-01-01', 'Original hardcoded form — carries full history.'),
  ('4918561', 'Manheim Atlanta', date '2000-01-01', 'Original hardcoded form — carries full history.'),
  ('6073028', 'Manheim Tampa',   date '2000-01-01', 'Original hardcoded form — carries full history.')
on conflict (form_id) do nothing;

alter table production_forms enable row level security;
drop policy if exists production_forms_team_read on production_forms;
create policy production_forms_team_read on production_forms
  for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')));
drop policy if exists production_forms_admin_write on production_forms;
create policy production_forms_admin_write on production_forms
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin')));
