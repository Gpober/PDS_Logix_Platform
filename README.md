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
- **Assistant** — `Logix`, a read-only AI assistant that answers questions live
  from the CRM (owner/admin only; needs `ANTHROPIC_API_KEY`)

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
SUPABASE_SERVICE_ROLE_KEY=...   # optional (server tasks)
ANTHROPIC_API_KEY=...           # enables the Logix assistant
```
