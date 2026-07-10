-- =============================================================================
-- Tulips Talent — 0030_drop_native_quickbooks.sql
-- Reverses the native QuickBooks connection from 0029. We're not connecting
-- QBO directly from Tulips anymore — I AM CFO owns the QuickBooks connection and
-- the invoice/bill engine, and the Tulips CRM calls it server-to-server.
-- We KEEP deals.qbo_invoice_id / deals.qbo_bill_id to store the ids I AM CFO
-- returns, so a deal can link straight to its invoice/bill. Run AFTER 0029.
-- Safe to re-run.
-- =============================================================================

drop table if exists public.quickbooks_connection;

alter table public.brands drop column if exists qbo_customer_id;
alter table public.talent drop column if exists qbo_vendor_id;

-- deals.qbo_invoice_id and deals.qbo_bill_id are intentionally retained.
