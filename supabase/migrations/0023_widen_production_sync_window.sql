-- Widen the nightly sync's rolling window from 3 days to 7.
--
-- The 3-day window (current_date - 2) meant any outage longer than three days
-- left a permanent hole: when the platform project was paused Aug 18-21 2026,
-- Aug 18 had already fallen out of the window by the time the sync recovered,
-- and its missing 224 units had to be backfilled by hand. Seven days lets the
-- sync heal a week-long outage on its own.
--
-- Re-running a range is cheap: ingest_production dedupes on the Connecteam entry
-- number, so the overlap just increments skipped_existing (823 skipped / 348
-- inserted on the recovery run).
--
-- Rewrites the command in place rather than restating it, so the sync token
-- stays in the database and out of this repo. No-op once applied.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'production-nightly-sync'),
  command => replace(
    (select command from cron.job where jobname = 'production-nightly-sync'),
    'current_date - 2',
    'current_date - 7'
  )
);
