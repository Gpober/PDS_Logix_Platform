-- =============================================================================
-- Tulips Talent — 0025_content_scheduling.sql
-- Real scheduling: give each post a precise publish time plus publish
-- bookkeeping so a cron can auto-publish due posts on the creator's behalf.
-- Run AFTER 0024. Safe to re-run.
-- =============================================================================

alter table public.content_posts
  add column if not exists scheduled_at     timestamptz,  -- exact publish instant (UTC)
  add column if not exists published_at     timestamptz,  -- when it actually went out
  add column if not exists publish_error    text,         -- last failure reason, if any
  add column if not exists publish_attempts integer not null default 0;

-- Allow a 'failed' status (auto-publish exhausted its retries). Existing rows are
-- unaffected — they stay idea/draft/scheduled/posted.
alter table public.content_posts drop constraint if exists content_posts_status_check;
alter table public.content_posts
  add constraint content_posts_status_check
  check (status in ('idea', 'draft', 'scheduled', 'posted', 'failed'));

-- The cron scans for due scheduled posts; a partial index keeps that scan cheap.
create index if not exists idx_content_posts_due
  on public.content_posts (scheduled_at)
  where status = 'scheduled';

-- No RLS changes: the existing staff/self policies are FOR ALL, so they already
-- cover the new columns. The cron reads/writes with the service role (bypasses
-- RLS) because it acts on behalf of every creator with no user session.
