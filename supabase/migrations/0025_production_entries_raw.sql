-- Per-entry read for the Connecteam MCP's connecteam_get_production_entries.
--
-- The MCP holds only the CRM anon key, and RLS denies it production_entries
-- directly, so this is SECURITY DEFINER and granted to anon exactly like
-- production_report. Read-only and bounded (10k rows per call).
--
-- Note: `location` is where the unit was logged on the form, which can differ
-- from the profile location production_report shows for that worker.
create or replace function public.production_entries_raw(
  p_from         date,
  p_to           date,
  p_location     text default null,
  p_service_type text default null,
  p_worker       text default null,
  p_limit        int  default 2000,
  p_offset       int  default 0
)
returns table(
  entry_id     text,
  entry_date   date,
  worker       text,
  location     text,
  service_type text,
  quantity     int
)
language sql
security definer
set search_path to 'public'
stable
as $function$
  select e.external_id,
         date(e.submitted_at),
         coalesce(s.name, e.staff_name),
         e.location,
         e.service_type,
         1                       -- one row is one unit serviced
  from public.production_entries e
  left join public.staff s on s.id = e.staff_id
  where e.submitted_at >= p_from
    and e.submitted_at <  (p_to + 1)
    and (p_location     is null or e.location     ilike '%' || p_location     || '%')
    and (p_service_type is null or e.service_type ilike '%' || p_service_type || '%')
    and (p_worker       is null or coalesce(s.name, e.staff_name) ilike '%' || p_worker || '%')
  order by e.submitted_at, e.external_id
  limit  least(greatest(coalesce(p_limit, 2000), 1), 10000)
  offset greatest(coalesce(p_offset, 0), 0)
$function$;

grant execute on function public.production_entries_raw(date, date, text, text, text, int, int) to anon;
