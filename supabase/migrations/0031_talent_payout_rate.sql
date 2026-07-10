-- =============================================================================
-- Tulips Talent — 0031_talent_payout_rate.sql
-- A per-creator payout rate, set at onboarding, so billing knows the talent's
-- cut without a second source of truth. Stored as a percentage (e.g. 80 = 80%).
-- When a deal is billed, this is passed to I AM CFO as the talent split; if it's
-- blank, I AM CFO falls back to its own default. Run AFTER 0030. Safe to re-run.
-- =============================================================================

alter table public.talent add column if not exists payout_pct numeric;
