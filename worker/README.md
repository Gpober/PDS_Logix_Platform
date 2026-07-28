# Zordon operations-team worker (Railway)

A small always-on Node service that runs Zordon's specialist crew in the
background — with **no request timeout**, which is the whole reason it lives
here instead of a serverless function. It polls the `team_runs` queue in
Supabase, claims queued runs, builds a business snapshot, works the crew over
it, and writes the results back for the CRM's **Team** page
(`/crm/assistant/team`) to show.

Nothing else changes: the Next.js app stays on Vercel. This is a separate
Railway service pointed at the **same repo**.

## What it does

1. Poll `team_runs` for `status = 'queued'` (oldest first) and claim one.
2. Build a compact **business snapshot** (jobs by status/service, pipeline vs
   invoiced, margin, top clients, completed-not-invoiced, recent leads) via the
   Supabase service role.
3. Run the specialist crew (Operations Analyst + Pipeline Strategist by default;
   the brief can pull in the Quality Reviewer or Client Manager) over the
   snapshot, reusing the personas in `lib/assistant/specialists.ts`.
4. Write results back incrementally, then mark the run `done` (or `error`).

Read-only over your data; it never writes to the CRM or QuickBooks — it produces
plans for a human, same boundary as the rest of Zordon.

## Deploy on Railway

1. **New Project → Deploy from GitHub repo** → pick `gpober/PDS_Logix_Platform`.
2. In the service settings set **Config-as-code path** to `worker/railway.toml`
   (or set the start command to `npx tsx worker/index.ts`). It builds
   `worker/Dockerfile` — no web port. Keep it separate from the web service.
3. Set service **Variables**:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `POLL_INTERVAL_MS` *(optional, default `5000` — always-on mode only)*
   - `RUN_ONCE=true` *(only for cron mode)*
4. **Always-on:** just deploy — logs show `always-on mode; polling…`.
   **Cron:** add a **Cron Schedule** (e.g. `*/5 * * * *`) and set `RUN_ONCE=true`.

Scale horizontally if you like — the claim step is guarded by
`status = 'queued'`, so multiple worker replicas won't double-process a run.

## Run locally

```bash
ANTHROPIC_API_KEY=... \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run worker
```

Then launch a run from the CRM's **Team** page and watch it fill in.
