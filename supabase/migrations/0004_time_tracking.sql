-- Employee time tracking (clock in / clock out)
-- (Applied to the live PDS Logix CRM project; mirrored here.)

create table if not exists time_entries (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff (id) on delete cascade,
  job_id     uuid references jobs (id) on delete set null,
  clock_in   timestamptz not null default now(),
  clock_out  timestamptz,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_entries_staff_idx on time_entries (staff_id);
-- At most one open (not-yet-clocked-out) entry per staff member.
create unique index if not exists time_entries_one_open_per_staff
  on time_entries (staff_id) where (clock_out is null);

alter table time_entries enable row level security;
drop policy if exists time_entries_team_all on time_entries;
create policy time_entries_team_all on time_entries
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')));

drop trigger if exists time_entries_set_updated_at on time_entries;
create trigger time_entries_set_updated_at before update on time_entries
  for each row execute function qbo_set_updated_at();
