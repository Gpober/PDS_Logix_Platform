-- Worker portal: personal production goals + a per-worker production rollup.
--
-- 1) production_goals gains staff_name so a target can belong to ONE worker
--    (their own goal in the portal), alongside the existing company/location
--    goals. The unique scope index is redefined to include staff_name, so a
--    worker goal and a company goal for the same month don't collide.
alter table production_goals add column if not exists staff_name text;

drop index if exists production_goals_scope_uq;
create unique index if not exists production_goals_scope_uq
  on production_goals (coalesce(location, ''), coalesce(staff_name, ''), coalesce(period, ''));

-- 2) get_worker_production — one worker's units, sliced by service, location,
--    month, and day. Mirrors get_production_summary but scoped to staff_name so
--    the portal (and worker Zordon) can answer "how am I doing" without reading
--    the whole company log.
create or replace function get_worker_production(p_staff text, p_from date default null, p_to date default null)
returns jsonb
language sql
stable
as $$
  with base as (
    select * from production_entries
    where staff_name = p_staff
      and (p_from is null or submitted_at >= p_from)
      and (p_to is null or submitted_at < (p_to + 1))
  )
  select jsonb_build_object(
    'total_units', (select count(*) from base),
    'date_from', (select min(submitted_at)::date from base),
    'date_to', (select max(submitted_at)::date from base),
    'by_service', (select coalesce(jsonb_agg(jsonb_build_object('service_type', service_type, 'units', n) order by n desc), '[]'::jsonb) from (select service_type, count(*) n from base group by service_type) x),
    'by_location', (select coalesce(jsonb_agg(jsonb_build_object('location', location, 'units', n) order by n desc), '[]'::jsonb) from (select location, count(*) n from base group by location) x),
    'by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'units', n) order by m), '[]'::jsonb) from (select to_char(submitted_at, 'YYYY-MM') m, count(*) n from base group by 1) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d::text, 'units', n) order by d), '[]'::jsonb) from (select submitted_at::date d, count(*) n from base group by 1) x)
  );
$$;
grant execute on function get_worker_production(text, date, date) to authenticated, anon;
