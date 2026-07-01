# PDS Logix Platform

An operations platform for a **vehicle services** company running three service
lines — **Condition Reports** (inspections), **Detailing** (reconditioning), and
**Biohazard** (remediation). Built on a single Supabase backend, in phases
modeled on the Tulips Talent platform.

- **Phase 1 — Data layer** (`supabase/`): Clients, Contacts, Staff, Assets,
  Jobs, Condition Reports, with owner-only pricing isolation and RLS. ✅
- **Phase 2 — Internal CRM** (`app/crm`, planned): a Next.js app where the team
  manages clients, schedules jobs, assigns staff, and files condition reports.
- **Phase 3 — Public website** (planned): a polished marketing site that reads
  the *same* Supabase backend through a locked-down anonymous role (services,
  a "trusted by" client wall, a work portfolio, and a "request a quote" form).

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
