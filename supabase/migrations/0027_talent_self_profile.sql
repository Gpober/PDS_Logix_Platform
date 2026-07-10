-- =============================================================================
-- Tulips Talent — 0027_talent_self_profile.sql
-- Let a creator edit their OWN profile — but only safe, content fields. Staff keep
-- control of publishing (is_public), the URL slug, verification, and internal
-- notes. We use a SECURITY DEFINER function scoped to current_talent_id() and a
-- fixed column whitelist, rather than a broad UPDATE grant, so a creator can never
-- touch anything but these fields on their own row. Run AFTER 0026. Safe to re-run.
-- =============================================================================

create or replace function public.update_my_profile(
  p_name         text,
  p_category     text,
  p_location     text,
  p_bio          text,
  p_headshot_url text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  tid := public.current_talent_id();
  if tid is null then
    raise exception 'no linked talent profile for this user';
  end if;

  update public.talent set
    -- name is required, so ignore a blank submission instead of nulling it out.
    name         = coalesce(nullif(btrim(p_name), ''), name),
    category     = nullif(btrim(p_category), ''),
    location     = nullif(btrim(p_location), ''),
    bio          = nullif(btrim(p_bio), ''),
    headshot_url = nullif(btrim(p_headshot_url), ''),
    updated_at   = now()
  where id = tid;
end;
$$;

grant execute on function public.update_my_profile(text, text, text, text, text) to authenticated;
