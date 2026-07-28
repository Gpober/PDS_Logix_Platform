# PDS Logix Platform

The PDS Logix operations CRM — a vehicle field-service business (condition-report
inspections, detailing, and biohazard remediation for dealers, fleets, and
insurers). Built on the same proven foundation as the Tulips platform
(Next.js App Router + Supabase SSR auth + an AI assistant), re-modeled for the
PDS Logix domain.

## Stack
- **Next.js** (App Router, TypeScript) + Tailwind, deployed on Vercel
- **Supabase** for data + auth (cookie auth via `@supabase/ssr`; every read/write
  runs as the logged-in user so RLS is enforced server-side)
- **Claude** (`@anthropic-ai/sdk`) powers the `Logix` operations assistant

## The CRM (`/crm`, sign in at `/login`)
Cookie-authenticated, owner/admin/member roles. Tabs:

- **Home** — dashboard: counts, job pipeline by stage, pipeline vs invoiced $, recent jobs
- **Clients** — dealers/fleets/insurers, with contacts and linked assets
- **Contacts** — people at each client
- **Staff** — technicians / inspectors
- **Assets** — the vehicles serviced (year/make/model, VIN, plate, mileage)
- **Jobs** — service jobs with type (condition report / detailing / biohazard),
  a status flow (requested → scheduled → in_progress → completed → invoiced),
  pricing + margin, and a condition report for inspections
- **Leads** — the inbound lead pipeline
- **Assistant** — `Zordon`, the operations chief-of-staff (owner/admin only;
  needs `ANTHROPIC_API_KEY`). Reads live from the whole CRM and the books, and —
  built to parity with the Tulips backend — also:
  - **Gated write-actions** — create/update clients, contacts, assets, and jobs;
    every consequential action surfaces a confirmation card and only runs when a
    human clicks Confirm.
  - **QuickBooks suite** — read invoices/bills, invoice a job, create ad-hoc
    invoices and vendor bills, correct an invoice, and find/clean up duplicate
    invoices (all gated). Needs the `QBO_*` vars + a connected QBO company.
  - **Memory + visual reports** — remembers durable facts across sessions
    (`/crm/assistant/memory`) and composes shareable chart reports
    (`/crm/assistant/reports`).
  - **Specialists + a background worker** — delegates to a crew (Operations
    Analyst, Pipeline Strategist, Client Manager, Quality Reviewer, Outreach
    Writer). Long/roster-wide runs go to an always-on Railway worker
    (`worker/`) off the `team_runs` queue; watch them on `/crm/assistant/team`.
  - **Drafts + attachments** — drafts follow-up/quote emails to review and send
    (`/crm/assistant/drafts`), and reads attached images, PDFs, and CSVs.

## Database
See [`supabase/README.md`](supabase/README.md). The live Supabase project is the
source of truth; `supabase/migrations/0001_schema.sql` + `0002_rls.sql` mirror it.

## Run locally
```bash
cp .env.example .env.local   # fill in the Supabase URL + anon key
npm install
npm run dev
```

## Environment
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# server-only, never shipped to the browser:
SUPABASE_SERVICE_ROLE_KEY=...   # optional for the web app; REQUIRED for the worker
ANTHROPIC_API_KEY=...           # enables the Zordon assistant
QBO_CLIENT_ID=...               # QuickBooks (optional — enables the QBO tools)
QBO_CLIENT_SECRET=...
```

The **Zordon team worker** (`worker/`) is a separate Railway service — see
[`worker/README.md`](worker/README.md). It needs `ANTHROPIC_API_KEY`,
`SUPABASE_URL` (or the `NEXT_PUBLIC_` one), and `SUPABASE_SERVICE_ROLE_KEY`.
