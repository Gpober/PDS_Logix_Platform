# PDS Logix Platform

An operations platform for a **vehicle services** company running three service
lines — **Condition Reports** (inspections), **Detailing** (reconditioning), and
**Biohazard** (remediation). Built on a single Supabase backend, in phases
modeled on the Tulips Talent platform.

- **Phase 1 — Data layer** (`supabase/`): Clients, Contacts, Staff, Assets,
  Jobs, Condition Reports, with owner-only pricing isolation and RLS. ✅
- **Phase 2 — Internal CRM** (`app/crm`): a Next.js app where the team manages
  clients, contacts, vehicles, jobs, staff, and leads. Owner-only pricing. ✅
- **Phase 3 — Public website** (`app/`): marketing landing (services + stats)
  and a public "request a quote" form that writes a lead under the locked-down
  anon role. ✅ (client wall / work portfolio views exist in the DB, ready to
  surface next.)

## Run locally

```bash
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm install
npm run dev                  # http://localhost:3000
```

The app is Next.js (App Router, TypeScript) + Tailwind + `@supabase/ssr`.
Public pages (`/`, `/contact`) render for anyone; `/crm` is gated by Supabase
auth via middleware. Create the first owner in Supabase Auth, then
`update profiles set role='owner' where email='you@pdslogix.com';`

## Domain model

| Entity | What it is |
|--------|-----------|
| `clients` | Companies that hire PDS (dealership, fleet, rental, insurer, body shop) |
| `contacts` | People at a client company |
| `staff` | The PDS crew who inspect, photograph, detail, and handle biohazard work |
| `assets` | The vehicle being serviced (VIN, year/make/model, mileage, plate) |
| `jobs` | A work order — one service line, on one asset, for one client, one staff |
| `job_pricing` | Price/cost for a job — **owner/admin only** |
| `condition_reports` | The structured inspection deliverable (findings + photos) |
| `leads` | Inbound "request a quote" submissions from the public site |

See [`supabase/README.md`](supabase/README.md) for the migration run order and
the SQL that proves the anon role cannot read pricing, VINs, or contact details.

## Status

Phase 1 (database) is in place as SQL migrations. The Next.js app (CRM + public
site) is the next phase — the schema, RLS, and views it will read are ready.
