-- Long-format matrix: units per (row dimension value, month). Dimension is
-- 'staff' | 'service' | 'location'. The client pivots into a row×month grid.
create or replace function get_production_matrix(p_dimension text default 'staff', p_location text default null, p_from date default null, p_to date default null)
returns jsonb
language sql
stable
as $$
  with base as (
    select
      case p_dimension when 'service' then service_type when 'location' then location else staff_name end as k,
      to_char(submitted_at, 'YYYY-MM') as ym
    from production_entries
    where (p_location is null or location = p_location)
      and (p_from is null or submitted_at >= p_from)
      and (p_to is null or submitted_at < (p_to + 1))
  )
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'month', ym, 'units', n)), '[]'::jsonb)
  from (select coalesce(k, 'Unassigned') k, ym, count(*) n from base group by 1, 2) x;
$$;
grant execute on function get_production_matrix(text, text, date, date) to authenticated, anon;
