-- =============================================================================
-- Tulips Talent — 0019_talent_accounts.sql
-- Self-managed social accounts for the creator portal: each creator lists their
-- platforms (Instagram, TikTok, YouTube, …) with handle, link, and followers, in
-- one place. Doubles as the data behind their public media kit.
-- Run AFTER 0018. Safe to re-run.
-- =============================================================================

create table if not exists public.talent_accounts (
  id         uuid primary key default gen_random_uuid(),
  talent_id  uuid not null references public.talent(id) on delete cascade,
  platform   text not null,               -- 'instagram' | 'tiktok' | 'youtube' | 'x' | 'website' | ...
  handle     text,                         -- e.g. @jane
  url        text,                         -- full profile link
  followers  numeric,                      -- self-reported audience size
  sort       integer not null default 0,   -- display order
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_accounts_talent on public.talent_accounts(talent_id);

drop trigger if exists trg_talent_accounts_updated_at on public.talent_accounts;
create trigger trg_talent_accounts_updated_at
  before update on public.talent_accounts
  for each row execute function public.set_updated_at();

alter table public.talent_accounts enable row level security;

-- Staff manage everyone; a creator manages only their own rows.
drop policy if exists talent_accounts_staff on public.talent_accounts;
create policy talent_accounts_staff on public.talent_accounts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists talent_accounts_self on public.talent_accounts;
create policy talent_accounts_self on public.talent_accounts
  for all to authenticated
  using (talent_id = public.current_talent_id())
  with check (talent_id = public.current_talent_id());

-- Public read for accounts belonging to a published creator, so profiles/media
-- kits can show them.
drop policy if exists talent_accounts_public_read on public.talent_accounts;
create policy talent_accounts_public_read on public.talent_accounts
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.talent t
      where t.id = talent_accounts.talent_id and t.is_public = true
    )
  );

grant select on public.talent_accounts to anon;
grant select, insert, update, delete on public.talent_accounts to authenticated;
