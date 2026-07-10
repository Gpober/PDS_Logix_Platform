-- =============================================================================
-- Tulips Talent — 0022_youtube_connections.sql
-- "Connect YouTube": a creator authorizes their own Google/YouTube account (any
-- Google account, independent of their portal login) and we pull verified stats.
-- Refresh tokens live in youtube_connections, which is NEVER exposed to anon and
-- is only ever read server-side. Run AFTER 0021. Safe to re-run.
-- =============================================================================

-- Non-secret channel id lives on the account (safe for the public media kit).
alter table public.talent_accounts add column if not exists yt_channel_id text;

create table if not exists public.youtube_connections (
  talent_account_id uuid primary key references public.talent_accounts(id) on delete cascade,
  channel_id        text,
  channel_title     text,
  refresh_token     text,
  access_token      text,
  expiry            timestamptz,
  updated_at        timestamptz not null default now()
);

alter table public.youtube_connections enable row level security;

-- Staff manage all. A creator may access their own connection (server-side use
-- only — tokens never reach the browser). No grant to anon at all.
drop policy if exists yt_conn_staff on public.youtube_connections;
create policy yt_conn_staff on public.youtube_connections
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists yt_conn_self on public.youtube_connections;
create policy yt_conn_self on public.youtube_connections
  for all to authenticated
  using (
    exists (
      select 1 from public.talent_accounts ta
      where ta.id = youtube_connections.talent_account_id
        and ta.talent_id = public.current_talent_id()
    )
  )
  with check (
    exists (
      select 1 from public.talent_accounts ta
      where ta.id = youtube_connections.talent_account_id
        and ta.talent_id = public.current_talent_id()
    )
  );

grant select, insert, update, delete on public.youtube_connections to authenticated;
