-- =============================================================================
-- Tulips Talent — 0016_link_talent_account.sql
-- Owner-only helper to link a talent row to an existing auth user (by that
-- user's account email) and flip them to the 'talent' role — powering the CRM's
-- "grant portal access" action without hand-SQL. SECURITY DEFINER so it can
-- update profiles.role; still gated to is_owner(). Run AFTER 0015. Safe to re-run.
-- =============================================================================

create or replace function public.link_talent_account(p_talent_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  if not public.is_owner() then
    return 'not_owner';
  end if;
  select id into v_uid from public.profiles where lower(email) = lower(trim(p_email));
  if v_uid is null then
    return 'no_user';
  end if;
  update public.talent set user_id = v_uid where id = p_talent_id;
  update public.profiles set role = 'talent' where id = v_uid;
  return 'ok';
end;
$$;
