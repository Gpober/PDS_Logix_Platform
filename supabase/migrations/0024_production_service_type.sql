-- Carry the real service type into production_entries.
--
-- ingest_production hard-coded service_type to 'Condition Report' for every row
-- it inserted, so the CRM could not tell condition reports from photo work.
-- 2,597 rows between Aug 6 and Aug 22 2026 were photo work filed as CRS. The
-- platform DB had it all along as connecteam_form_submissions.submission_type;
-- the edge function now selects it and passes it through.
--
-- service_type stays optional in the payload so an older caller keeps working.
create or replace function public.ingest_production(p_rows jsonb)
returns table(inserted integer, skipped integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_before bigint;
  v_after  bigint;
  v_total  int;
begin
  v_total := coalesce(jsonb_array_length(p_rows), 0);
  select count(*) into v_before from public.production_entries;

  insert into public.production_entries
    (external_id, source, service_type, location, staff_name, staff_id, submitted_at, status)
  select x.external_id,
         'connecteam',
         coalesce(nullif(trim(x.service_type), ''), 'Condition Report'),
         x.location,
         x.staff_name,
         x.staff_id::uuid,
         (x.submitted_at)::timestamptz,
         'None'
  from jsonb_to_recordset(p_rows)
       as x(external_id text, location text, staff_name text, staff_id text,
            submitted_at text, service_type text)
  where x.staff_id is not null and x.external_id is not null
  on conflict (location, external_id) where external_id is not null do nothing;

  select count(*) into v_after from public.production_entries;
  inserted := (v_after - v_before)::int;
  skipped  := v_total - inserted;
  return next;
end
$function$;

-- Repair pass. ingest_production only inserts (on conflict do nothing), so
-- without this every row written before the fix keeps its wrong service type.
-- Re-running the nightly sync over a date range now corrects history too.
create or replace function public.retype_production_entries(p_rows jsonb)
returns table(retyped integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count int;
begin
  with incoming as (
    select x.external_id,
           x.location,
           nullif(trim(x.service_type), '') as service_type
    from jsonb_to_recordset(p_rows)
         as x(external_id text, location text, service_type text)
    where x.external_id is not null and nullif(trim(x.service_type), '') is not null
  )
  update public.production_entries e
     set service_type = i.service_type
    from incoming i
   where e.external_id = i.external_id
     and e.location    = i.location
     and e.source      = 'connecteam'
     and e.service_type is distinct from i.service_type;

  get diagnostics v_count = row_count;
  retyped := v_count;
  return next;
end
$function$;

grant execute on function public.retype_production_entries(jsonb) to service_role;
