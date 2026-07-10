-- =============================================================================
-- Tulips Talent — 0024_instagram_connections.sql
-- "Connect Instagram" + publishing. A creator authorizes their IG Business
-- account (via Facebook Login); we store the page token + IG user id and can
-- publish posts from the content planner. Tokens are server-side only, never
-- exposed to anon. Run AFTER 0023. Safe to re-run.
-- =============================================================================

create table if not exists public.instagram_connections (
  talent_id     uuid primary key references public.talent(id) on delete cascade,
  ig_user_id    text,          -- Instagram Business Account id
  username      text,
  page_id       text,          -- linked Facebook Page id
  access_token  text,          -- long-lived Page access token
  token_expiry  timestamptz,
  updated_at    timestamptz not null default now()
);

alter table public.instagram_connections enable row level security;

drop policy if exists ig_conn_staff on public.instagram_connections;
create policy ig_conn_staff on public.instagram_connections
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists ig_conn_self on public.instagram_connections;
create policy ig_conn_self on public.instagram_connections
  for all to authenticated
  using (talent_id = public.current_talent_id())
  with check (talent_id = public.current_talent_id());

grant select, insert, update, delete on public.instagram_connections to authenticated;
