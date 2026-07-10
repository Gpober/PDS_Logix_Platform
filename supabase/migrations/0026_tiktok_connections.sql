-- =============================================================================
-- Tulips Talent — 0026_tiktok_connections.sql
-- "Connect TikTok" + publishing via the Content Posting API. A creator authorizes
-- their TikTok account (Login Kit); we store the tokens and can direct-post videos
-- and photos from the content planner. Tokens are server-side only. TikTok access
-- tokens last ~24h (refresh tokens ~365 days), so token_expiry is refreshed often.
-- Run AFTER 0025. Safe to re-run.
-- =============================================================================

create table if not exists public.tiktok_connections (
  talent_id      uuid primary key references public.talent(id) on delete cascade,
  open_id        text,          -- TikTok user id for this app
  username       text,          -- display name / handle
  access_token   text,
  refresh_token  text,
  scope          text,
  token_expiry   timestamptz,   -- access token expiry (~24h out)
  refresh_expiry timestamptz,   -- refresh token expiry (~365 days out)
  updated_at     timestamptz not null default now()
);

alter table public.tiktok_connections enable row level security;

drop policy if exists tt_conn_staff on public.tiktok_connections;
create policy tt_conn_staff on public.tiktok_connections
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists tt_conn_self on public.tiktok_connections;
create policy tt_conn_self on public.tiktok_connections
  for all to authenticated
  using (talent_id = public.current_talent_id())
  with check (talent_id = public.current_talent_id());

grant select, insert, update, delete on public.tiktok_connections to authenticated;
