-- =============================================================================
-- Tulips Talent — 0033_instagram_graph_connections.sql
-- The Facebook-login Instagram connection (separate from the Instagram-login
-- publishing connection in 0024). This one uses a Facebook Page linked to an IG
-- Business account and a Page access token, so we can call graph.facebook.com
-- for Business Discovery (followers/posts) and Insights (reach + demographics).
-- Tokens are server-side only. Run AFTER 0032. Safe to re-run.
-- =============================================================================

create table if not exists public.instagram_graph_connections (
  talent_id       uuid primary key references public.talent(id) on delete cascade,
  ig_business_id  text not null,       -- Page-linked Instagram Business account id
  ig_username     text,
  page_id         text,
  page_token      text,                -- long-lived Page access token
  user_token      text,                -- long-lived user token (for re-derivation)
  token_expiry    timestamptz,
  connected_by    uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table public.instagram_graph_connections enable row level security;

drop policy if exists ig_graph_conn_staff on public.instagram_graph_connections;
create policy ig_graph_conn_staff on public.instagram_graph_connections
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists ig_graph_conn_self on public.instagram_graph_connections;
create policy ig_graph_conn_self on public.instagram_graph_connections
  for all to authenticated
  using (talent_id = public.current_talent_id())
  with check (talent_id = public.current_talent_id());

grant select, insert, update, delete on public.instagram_graph_connections to authenticated;
