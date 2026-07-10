-- PDS Logix CRM — Row Level Security
--
-- Role model (from profiles.role): owner / admin / member all have full CRM
-- access; the anon (public) role may only INSERT a lead. Mirrors the deployed
-- project; the live database remains the source of truth.

-- Helper: is the caller a signed-in team member?
create or replace function is_team()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'admin', 'member')
  );
$$;

-- Enable RLS on every table.
do $$
declare t text;
begin
  foreach t in array array['profiles','clients','contacts','staff','assets','jobs','job_pricing','condition_reports','leads']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Profiles: you can read/update your own row; the team can read all.
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select using (auth.uid() = id or is_team());
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- CRM tables: full access for the team.
do $$
declare t text;
begin
  foreach t in array array['clients','contacts','staff','assets','jobs','job_pricing','condition_reports']
  loop
    execute format('drop policy if exists %I_team_all on public.%I', t, t);
    execute format(
      'create policy %I_team_all on public.%I for all using (is_team()) with check (is_team())',
      t, t
    );
  end loop;
end $$;

-- Leads: the team reads/manages; the public site may only insert (write-only).
drop policy if exists leads_team_read on leads;
create policy leads_team_read on leads for select using (is_team());
drop policy if exists leads_team_write on leads;
create policy leads_team_write on leads for all using (is_team()) with check (is_team());
drop policy if exists leads_anon_insert on leads;
create policy leads_anon_insert on leads for insert to anon with check (true);
grant insert on table leads to anon;
