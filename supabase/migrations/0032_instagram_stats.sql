-- =============================================================================
-- Tulips Talent — 0032_instagram_stats.sql
-- Rich Instagram stats per creator, powering the media-kit page (à la july.bio).
-- Tier 1 (followers, media count, recent posts, engagement) comes from the
-- public Business Discovery API. Tier 2 (reach, views, saves, audience
-- demographics) comes from Instagram Insights and only fills once the creator
-- has connected their own IG AND instagram_manage_insights is approved — so
-- those columns are nullable and simply stay null until then.
-- Run AFTER 0031. Safe to re-run.
-- =============================================================================

create table if not exists public.instagram_stats (
  talent_id          uuid primary key references public.talent(id) on delete cascade,
  username           text,
  -- Tier 1 (Business Discovery — public)
  followers          integer,
  media_count        integer,
  engagement_rate    numeric,     -- percent, e.g. 5.93
  avg_post_likes     integer,
  avg_post_comments  integer,
  recent_posts       jsonb,       -- [{permalink, media_url, media_type, like_count, comments_count, timestamp}]
  -- Tier 2 (Insights — owner-connected only)
  reach              integer,
  views              integer,
  likes              integer,
  comments           integer,
  shares             integer,
  saves              integer,
  total_interactions integer,
  avg_story_views    integer,
  audience_gender    jsonb,       -- {"male": 91, "female": 9}
  audience_age       jsonb,       -- {"13-17": 2.7, "18-24": 20.7, ...}
  audience_country   jsonb,       -- {"US": 61.2, ...}
  has_insights       boolean not null default false,
  synced_at          timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.instagram_stats enable row level security;

-- Staff manage all.
drop policy if exists ig_stats_staff on public.instagram_stats;
create policy ig_stats_staff on public.instagram_stats
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- A creator manages their own.
drop policy if exists ig_stats_self on public.instagram_stats;
create policy ig_stats_self on public.instagram_stats
  for all to authenticated
  using (talent_id = public.current_talent_id())
  with check (talent_id = public.current_talent_id());

-- Public (anon) can read stats for publicly-listed creators — for the media kit.
drop policy if exists ig_stats_public on public.instagram_stats;
create policy ig_stats_public on public.instagram_stats
  for select to anon
  using (exists (select 1 from public.talent t where t.id = talent_id and t.is_public));

grant select on public.instagram_stats to anon;
grant select, insert, update, delete on public.instagram_stats to authenticated;
