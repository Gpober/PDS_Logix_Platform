-- A re-runnable claim for connecteam rows that arrive without a form_id.
--
-- 0027 backfilled form_id for everything present at the time, and 0029 caught
-- the 43 DFW stragglers. Neither is sufficient on its own: the sync running in
-- production is still the OLD insert-only code, which does not write form_id at
-- all, so every night it adds a fresh batch of unclaimed rows. Between 0027 and
-- the morning after, 223 more appeared.
--
-- Those rows matter because the new sync upserts on (form_id, external_id). A
-- null form_id is outside production_entries_form_uq, so the upsert would not
-- match the stored row, would try to insert a second copy, and would then fail
-- the whole chunk on the older (location, external_id) index.
--
-- Run this after each legacy sync until the new sync is deployed:
--   select * from public.claim_unformed_production_rows();
-- It is idempotent and returns what it claimed. Once the new sync is live it
-- becomes a no-op, because rows arrive with form_id already set.
--
-- Why entry-number ranges rather than location: a submission made on the
-- Manheim Dallas form can answer "Manheim DFW" for its location question, so
-- location does not identify the form. The two synced forms do occupy disjoint
-- entry-number spaces — Atlanta in the twenty-thousands, Dallas in the
-- two-hundred-thousands — and that is a property of Connecteam's per-form
-- numbering, not a coincidence of the current data.

create or replace function public.claim_unformed_production_rows()
returns table(claimed_form_id text, rows_claimed bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with claimed as (
    update production_entries pe
    set form_id = case
      when pe.external_id::bigint >= 200000 then '4875728'
      when pe.external_id::bigint <  30000  then '4918561'
    end
    where pe.form_id is null
      and pe.source = 'connecteam'
      and pe.external_id ~ '^[0-9]+$'
      and (pe.external_id::bigint >= 200000 or pe.external_id::bigint < 30000)
      -- Never create a duplicate identity.
      and not exists (
        select 1 from production_entries d
        where d.external_id = pe.external_id
          and d.form_id = case
            when pe.external_id::bigint >= 200000 then '4875728'
            when pe.external_id::bigint <  30000  then '4918561'
          end
      )
    returning pe.form_id
  )
  select c.form_id, count(*)::bigint from claimed c group by c.form_id;
end;
$function$;

grant execute on function public.claim_unformed_production_rows() to service_role;
