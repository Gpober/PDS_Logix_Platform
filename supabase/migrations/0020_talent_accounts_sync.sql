-- =============================================================================
-- Tulips Talent — 0020_talent_accounts_sync.sql
-- Wave 2 groundwork: mark accounts whose follower count was pulled live from the
-- platform's API (vs self-reported), and when. Run AFTER 0019. Safe to re-run.
-- =============================================================================

alter table public.talent_accounts
  add column if not exists verified       boolean not null default false,
  add column if not exists last_synced_at timestamptz;
