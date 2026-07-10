# PDS Logix Platform

> **Provenance / status.** This repo is a verbatim fork of the Tulips Talent
> backend, brought over to give PDS Logix the same proven foundation:
> Next.js (App Router) + Supabase (SSR cookie auth, RLS, role-scoped access,
> derived views, a locked-down public surface) and the AI assistant "brain"
> (`/api/assistant` + `lib/assistant/*`). The schema, code, and copy below are
> still the talent-agency originals (Brands / Talent / Deals / Leads, the
> assistant "Zordon", etc.) — kept intact so the app builds and runs as-is.
> Rename and re-model these to PDS Logix's own domain (financial / property
> management) as the next step. The Expo `mobile/` app was intentionally left
> out of this foundation pass.

---

A talent/influencer agency platform on a single Supabase backend, built in phases:

- **Phase 1 — CRM data layer** (`supabase/`): Brands, Agencies, People, Talent,
  Deals, with owner-only budget isolation and RLS.
- **Phase 2 — Public website** (this Next.js app): a polished, public-facing site
  that reads the *same* Supabase backend through a locked-down anonymous role.
- **Phase 3 — Mobile app** (`mobile/`): an Expo team CRM companion, plus
  talent-facing screens gated by the `talent` role.

## Team CRM (authenticated)

The internal CRM lives in this same Next.js app under **`/crm`** (sign in at
`/login`). It uses cookie auth via `@supabase/ssr`, with every read/write run as
the logged-in user so RLS is enforced server-side:

- Tabs: **Brands / Agencies / People / Talent / Deals / Leads**
- Brand pages show the derived fields (date last booked, talent worked with,
  latest live link)
- Full create/edit for every entity; deals support create/edit/delete
- **Budget** is shown and editable only for owner/admin — members never receive
  it (the `/crm/deals` budget column is omitted for their session)

## Public website (Phase 2)

Next.js (App Router, TypeScript) + Tailwind, reading live from Supabase with the
**anon key only**.

### Pages
- `/` — hero, featured talent, brand wall
- `/roster` — all public talent, filterable by category
- `/talent/[slug]` — profile: photo, bio, audience stats, live partnership links
- `/brands` — the brand logo wall
- `/contact` — "Work with us" form that persists an inbound lead

### Run locally
```bash
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm install
npm run dev
```
The site renders with graceful empty states even before env vars are set.

### Data exposure — how the public role is locked down
The public site can only ever touch three curated views and one write-only table:

- **Reads** go through `public_talent`, `public_brands`,
  `public_talent_partnerships` — `security definer` views exposing an explicit
  safe-column list and only opted-in rows (`is_public` / `is_shareable`). The anon
  role has **zero** grants on the base tables, so `budget`, internal `notes`,
  private emails/phones, and `employee_count` are physically unreachable.
- **Writes** are limited to `leads`: anon may `INSERT` (RLS), never `SELECT`.
- The **service-role key is never used** by the website and never shipped to the
  browser.

Full migration + verification details are in [`supabase/README.md`](supabase/README.md).

## Database
See [`supabase/README.md`](supabase/README.md) for the migration run order
(`0001 → 0002 → 0003 → 0004`, then `seed.sql` + `seed_public.sql`) and the SQL
snippets that prove the anon role cannot read sensitive fields.
