-- =============================================================================
-- Tulips Talent — 0006_google_integration.sql  (Google Calendar + Gmail)
-- Adds per-user Google OAuth token storage and a deal→calendar-event mapping so
-- the CRM can act on each user's behalf (auto-sync bookings to Google Calendar,
-- send/read Gmail). Run AFTER 0001–0005. Safe to re-run.
--
-- These tables hold sensitive OAuth material, so RLS is strict: a row is only
-- ever visible to the user it belongs to. The Next.js server reads/writes them
-- while acting AS that user (anon key + their JWT), so `auth.uid()` matches.
-- The service-role key is never used for these.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. user_google_tokens: one row per user, holds the Google refresh token
--    (captured once at OAuth callback) plus a cached short-lived access token.
-- -----------------------------------------------------------------------------
create table if not exists public.user_google_tokens (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  refresh_token text,
  access_token  text,
  expiry        timestamptz,
  scopes        text,
  updated_at    timestamptz not null default now()
);

alter table public.user_google_tokens enable row level security;

drop trigger if exists trg_user_google_tokens_updated_at on public.user_google_tokens;
create trigger trg_user_google_tokens_updated_at
  before update on public.user_google_tokens
  for each row execute function public.set_updated_at();

-- Only the owning user (the server acting as them) may touch their tokens.
drop policy if exists user_google_tokens_self on public.user_google_tokens;
create policy user_google_tokens_self on public.user_google_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2. deal_calendar_events: maps a deal to the Google Calendar event that a given
--    user created for it, so edits/deletes update the right event. One event per
--    (deal, user) — auto-sync writes into the acting user's own calendar.
-- -----------------------------------------------------------------------------
create table if not exists public.deal_calendar_events (
  deal_id     uuid not null references public.deals(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_id    text not null,
  calendar_id text not null default 'primary',
  updated_at  timestamptz not null default now(),
  primary key (deal_id, user_id)
);

alter table public.deal_calendar_events enable row level security;

drop trigger if exists trg_deal_calendar_events_updated_at on public.deal_calendar_events;
create trigger trg_deal_calendar_events_updated_at
  before update on public.deal_calendar_events
  for each row execute function public.set_updated_at();

-- Staff only, and each user only ever sees their own mappings.
drop policy if exists deal_calendar_events_self on public.deal_calendar_events;
create policy deal_calendar_events_self on public.deal_calendar_events
  for all to authenticated
  using (user_id = auth.uid() and public.is_staff())
  with check (user_id = auth.uid() and public.is_staff());
