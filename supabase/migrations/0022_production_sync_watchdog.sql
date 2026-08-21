-- Watchdog for the nightly production sync.
--
-- How the nightly sync actually runs (none of this was in the repo before, which
-- is why it was invisible when it broke):
--   pg_cron job "production-nightly-sync" (15 6 * * *) in THIS database
--     -> net.http_post to the edge function `sync-production`
--       -> reads connecteam_form_submissions from the PDS Lgix platform project
--       -> rpc ingest_production() here, and appends a row to production_sync_log
--
-- The failure this guards against: net.http_post only QUEUES the request, so the
-- cron job records "succeeded" the moment it's queued. When the edge function
-- returned 500 for three nights running (the platform project was paused, so its
-- hostname stopped resolving), cron.job_run_details showed nothing but green.
--
-- This job re-reads the outcome the edge function itself recorded and raises, so
-- a failed sync shows up as a FAILED cron run in the dashboard instead of a
-- silent gap in production_entries.

select cron.schedule(
  'production-sync-watchdog',
  '30 6 * * *',  -- 15 minutes after the sync fires
  $watchdog$
  do $check$
  declare
    v_ok      boolean;
    v_msg     text;
    v_ran_at  timestamptz;
  begin
    select ok, message, ran_at
      into v_ok, v_msg, v_ran_at
      from public.production_sync_log
     order by ran_at desc
     limit 1;

    if v_ran_at is null or v_ran_at < now() - interval '3 hours' then
      raise exception
        'production sync watchdog: no sync has been logged since % — the nightly job did not reach the edge function',
        coalesce(v_ran_at::text, 'never');
    end if;

    if not v_ok then
      raise exception 'production sync watchdog: last sync failed — %', v_msg;
    end if;
  end
  $check$;
  $watchdog$
);
