-- =============================================================================
-- Tulips Talent — 0029_quickbooks.sql
-- QuickBooks Online integration (agency-wide, not per-creator): one connection
-- for Tulips' own books. Staff click "Connect QuickBooks" in Settings; we store
-- the realm + OAuth tokens here and use them server-side to post invoices (to
-- brands) and bills (creator payouts). Tokens are NEVER exposed to anon/browser.
-- Also stamps the QBO object ids onto brands / talent / deals so we don't create
-- duplicates. Run AFTER 0028. Safe to re-run.
-- =============================================================================

create table if not exists public.quickbooks_connection (
  realm_id       text primary key,           -- the QBO company id
  access_token   text,
  refresh_token  text,
  token_expiry   timestamptz,                 -- access token (~1h)
  refresh_expiry timestamptz,                 -- refresh token (~100d, rotates)
  connected_by   uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);

alter table public.quickbooks_connection enable row level security;

-- Staff only, and only ever read server-side (tokens never reach the browser).
drop policy if exists qbo_conn_staff on public.quickbooks_connection;
create policy qbo_conn_staff on public.quickbooks_connection
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.quickbooks_connection to authenticated;

-- Map our records to their QBO counterparts so repeat invoicing reuses them.
alter table public.brands add column if not exists qbo_customer_id text;
alter table public.talent add column if not exists qbo_vendor_id text;
alter table public.deals  add column if not exists qbo_invoice_id text;
alter table public.deals  add column if not exists qbo_bill_id text;
