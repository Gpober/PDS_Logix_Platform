-- =============================================================================
-- Tulips Talent — 0023_content.sql
-- Creator content workspace: a media library + a content planner whose posts can
-- be linked to brand deals (deliverables). Talent own their own rows; staff see
-- all. Run AFTER 0022. Safe to re-run.
-- =============================================================================

-- Media library — photos/videos a creator uploads to use in posts.
create table if not exists public.content_media (
  id         uuid primary key default gen_random_uuid(),
  talent_id  uuid not null references public.talent(id) on delete cascade,
  url        text not null,
  kind       text not null default 'image',   -- 'image' | 'video'
  created_at timestamptz not null default now()
);
create index if not exists idx_content_media_talent on public.content_media(talent_id);

-- Planned/scheduled posts. deal_id links a post to a brand deal (a deliverable).
create table if not exists public.content_posts (
  id           uuid primary key default gen_random_uuid(),
  talent_id    uuid not null references public.talent(id) on delete cascade,
  deal_id      uuid references public.deals(id) on delete set null,
  platform     text not null default 'instagram',
  caption      text,
  scheduled_for date,
  status       text not null default 'idea'
               check (status in ('idea', 'draft', 'scheduled', 'posted')),
  media_urls   text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_content_posts_talent on public.content_posts(talent_id);
create index if not exists idx_content_posts_deal on public.content_posts(deal_id);

drop trigger if exists trg_content_posts_updated_at on public.content_posts;
create trigger trg_content_posts_updated_at
  before update on public.content_posts
  for each row execute function public.set_updated_at();

alter table public.content_media enable row level security;
alter table public.content_posts enable row level security;

-- Staff manage all; a creator manages only their own.
drop policy if exists content_media_staff on public.content_media;
create policy content_media_staff on public.content_media
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists content_media_self on public.content_media;
create policy content_media_self on public.content_media
  for all to authenticated
  using (talent_id = public.current_talent_id())
  with check (talent_id = public.current_talent_id());

drop policy if exists content_posts_staff on public.content_posts;
create policy content_posts_staff on public.content_posts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists content_posts_self on public.content_posts;
create policy content_posts_self on public.content_posts
  for all to authenticated
  using (talent_id = public.current_talent_id())
  with check (talent_id = public.current_talent_id());

grant select, insert, update, delete on public.content_media to authenticated;
grant select, insert, update, delete on public.content_posts to authenticated;
