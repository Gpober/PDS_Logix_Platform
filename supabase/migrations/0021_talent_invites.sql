-- =============================================================================
-- Tulips Talent — 0021_talent_invites.sql
-- "Invite to portal": the owner emails a creator a link to sign in (Google or
-- email). When they sign in for the first time, a trigger auto-links their new
-- account to the pending talent row and flips them to the 'talent' role — no
-- second manual "grant access" step. Run AFTER 0020. Safe to re-run.
-- =============================================================================

create table if not exists public.talent_invites (
  email      text primary key,
  talent_id  uuid not null references public.talent(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.talent_invites enable row level security;

-- Only staff (via the owner-gated invite action) touch invites.
drop policy if exists talent_invites_staff on public.talent_invites;
create policy talent_invites_staff on public.talent_invites
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- When a brand-new profile appears (first sign-in), consume any matching invite:
-- link the talent row to them and make them a 'talent'. SECURITY DEFINER so it
-- can update talent/profiles regardless of the signer's own permissions.
create or replace function public.consume_talent_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_talent_id uuid;
begin
  select talent_id into v_talent_id
  from public.talent_invites
  where lower(email) = lower(new.email);

  if v_talent_id is not null then
    update public.talent set user_id = new.id where id = v_talent_id;
    update public.profiles set role = 'talent' where id = new.id;
    delete from public.talent_invites where lower(email) = lower(new.email);
  end if;

  return new;
end;
$$;

drop trigger if exists on_profile_created_consume_invite on public.profiles;
create trigger on_profile_created_consume_invite
  after insert on public.profiles
  for each row execute function public.consume_talent_invite();

grant select, insert, update, delete on public.talent_invites to authenticated;
