-- Claim the last 43 connecteam rows that 0027's backfill could not place.
--
-- 0027 mapped form_id by location, which works for every row whose location
-- answer matched its form's name. These 43 did not: they were submitted on the
-- Manheim Dallas form but answered "Manheim DFW" for location — the same
-- form-vs-answer divergence that made (location, external_id) the wrong
-- identity in the first place.
--
-- They are Dallas-form rows on the evidence of their entry numbers: 209041 to
-- 265403 falls inside the Dallas form's range (207949-266389) and nowhere near
-- Atlanta's (20453-23917). None of them collide with an existing Dallas row.
--
-- This matters beyond tidiness. A row with a null form_id is not covered by
-- production_entries_form_uq, so the upserting sync would not match it, would
-- try to insert a second copy, and would then fail the whole chunk on the older
-- (location, external_id) index. Leaving them null breaks the next sync.

update production_entries pe
set form_id = '4875728'
where pe.form_id is null
  and pe.source = 'connecteam'
  and pe.external_id ~ '^[0-9]+$'
  and pe.external_id::bigint between 207949 and 266389
  -- Never overwrite our way into a duplicate: skip anything the Dallas form
  -- already holds under that entry number.
  and not exists (
    select 1 from production_entries d
    where d.form_id = '4875728' and d.external_id = pe.external_id
  );
