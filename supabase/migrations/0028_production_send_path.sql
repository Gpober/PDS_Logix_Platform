-- Production congruency, part 2: the SEND path.
--
-- The daily piecework email and every payroll question run through the
-- Connecteam MCP connector, which reads these two functions rather than the
-- app. Fixing the app alone would leave the numbers we actually send to people
-- on the old footing, so the same guarantees have to hold here.
--
-- Two changes:
--
--  1. production_report INNER JOINed staff. A production entry whose staff_id
--     never resolved — a new hire whose Connecteam form name does not match the
--     staff table, a rename, an accented character — was dropped from payroll
--     entirely and silently. It could not appear as a zero, because the row
--     simply was not there. It is a LEFT JOIN now: an unlinked worker shows up
--     under the name their form carried, with no rate, so the gap is visible
--     instead of invisible. (Nothing is unlinked today; this is the trap, not a
--     current loss.)
--
--  2. production_health is new: a single call that says whether the stored copy
--     is currently fit to report from — how stale it is, which forms are on the
--     roster, and which locations have gone quiet. A report that sends numbers
--     without checking this cannot tell a slow day from a broken sync, which is
--     the failure this whole change is aimed at.

-- ---------------------------------------------------------------------------
-- 1. Payroll counts stop dropping unlinked workers.
-- ---------------------------------------------------------------------------
create or replace function public.production_report(
  p_from     date,
  p_to       date,
  p_group    text default null,
  p_location text default null
)
returns table(
  staff_id      uuid,
  name          text,
  payroll_group text,
  location      text,
  unit_rate     numeric,
  hourly_rate   numeric,
  pieces        bigint,
  piece_pay     numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.id,
         coalesce(s.name, pe.staff_name, 'Unlinked (no name on form)') as name,
         s.payroll_group,
         max(pe.location) as location,
         s.unit_rate,
         s.hourly_rate,
         count(*)::bigint as pieces,
         round(count(*) * coalesce(s.unit_rate, 0), 2) as piece_pay
  from public.production_entries pe
  left join public.staff s on s.id = pe.staff_id
  where pe.submitted_at::date between p_from and p_to
    -- An unlinked row has no payroll group, so a group-filtered run cannot show
    -- it. Surfaced by an unfiltered run and by production_health instead.
    and (p_group is null or s.payroll_group = p_group)
    and (p_location is null or pe.location ilike '%' || p_location || '%')
  group by s.id, coalesce(s.name, pe.staff_name, 'Unlinked (no name on form)'),
           s.payroll_group, s.unit_rate, s.hourly_rate
  order by pieces desc;
$function$;

grant execute on function public.production_report(date, date, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Is the stored copy fit to report from?
-- ---------------------------------------------------------------------------
-- Answers, for a window: how much is stored, how stale it is, which forms feed
-- it, which locations produced, and which have gone quiet after previously
-- producing. `warnings` is the field to gate a send on — non-empty means say so
-- in the report or hold it.
create or replace function public.production_health(
  p_from date default (current_date - 7),
  p_to   date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- Defaults again inside the body: a caller that passes an explicit null (an
  -- MCP client filling every argument) would otherwise select an empty window
  -- and get back a clean bill of health for nothing at all.
  with bounds as (
    select coalesce(p_from, current_date - 7) as d_from,
           coalesce(p_to, current_date) as d_to
  ),
  window_rows as (
    select pe.* from public.production_entries pe, bounds b
    where pe.submitted_at::date between b.d_from and b.d_to
  ),
  latest as (
    select max(submitted_at) as last_entry_at from public.production_entries
  ),
  by_location as (
    select location,
           count(*)::bigint as entries,
           count(distinct staff_id)::bigint as workers,
           max(submitted_at)::date as last_entry
    from window_rows group by location
  ),
  -- Locations that have produced at some point but not inside this window: the
  -- shape a broken form takes, since a missing form looks exactly like a
  -- location that simply did no work.
  quiet as (
    select pe.location,
           max(pe.submitted_at)::date as last_entry
    from public.production_entries pe
    where pe.location not in (select location from by_location)
    group by pe.location
  ),
  roster as (
    select form_id, name, active_from, enabled, last_synced_at,
           (select count(*) from window_rows w where w.form_id = f.form_id)::bigint as entries_in_window
    from public.production_forms f
  ),
  unlinked as (
    select count(*)::bigint as n from window_rows where staff_id is null
  )
  select jsonb_build_object(
    'window', jsonb_build_object('from', (select d_from from bounds), 'to', (select d_to from bounds)),
    'checked_at', now(),
    'stored_entries', (select count(*) from window_rows),
    'last_entry_at', (select last_entry_at from latest),
    'hours_since_last_entry',
      round(extract(epoch from (now() - (select last_entry_at from latest))) / 3600.0, 1),
    'unlinked_entries', (select n from unlinked),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'location', location, 'entries', entries, 'workers', workers, 'last_entry', last_entry
      ) order by entries desc) from by_location), '[]'::jsonb),
    'quiet_locations', coalesce((
      select jsonb_agg(jsonb_build_object('location', location, 'last_entry', last_entry)
        order by last_entry desc) from quiet), '[]'::jsonb),
    'forms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'form_id', form_id, 'name', name, 'active_from', active_from,
        'enabled', enabled, 'last_synced_at', last_synced_at,
        'entries_in_window', entries_in_window
      ) order by entries_in_window desc) from roster), '[]'::jsonb),
    'warnings', (
      select coalesce(jsonb_agg(w), '[]'::jsonb) from (
        select 'No entries stored for this window at all.' as w
        where (select count(*) from window_rows) = 0
        union all
        select 'Newest entry is more than 36 hours old — the sync may not be running.'
        where (select last_entry_at from latest) < now() - interval '36 hours'
        union all
        select 'Some entries are not linked to a staff record; a group-filtered payroll run will not show them.'
        where (select n from unlinked) > 0
        union all
        select 'A location that has produced before recorded nothing in this window.'
        where exists (select 1 from quiet)
        union all
        select 'A form on the roster has never been synced.'
        where exists (select 1 from roster where last_synced_at is null and active_from <= (select d_to from bounds))
      ) x
    )
  );
$function$;

grant execute on function public.production_health(date, date) to anon, authenticated;
