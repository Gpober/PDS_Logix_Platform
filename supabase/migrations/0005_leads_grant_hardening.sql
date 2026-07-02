-- =============================================================================
-- PDS Logix Platform — 0005_leads_grant_hardening.sql
-- Least-privilege fix for the anon role on public.leads.
--
-- WHY: leads is created in 0004, i.e. AFTER 0002's `revoke all ... from anon`.
-- Supabase's default privileges therefore auto-granted anon SELECT/UPDATE/
-- REFERENCES on every column of the new table. RLS (no anon select/update
-- policy) already blocked the rows, but least privilege says the public role
-- should hold INSERT only. This migration strips it back.
--
-- (0004 has since been updated to do this inline; this file records the fix as
-- applied to already-provisioned databases. Safe to re-run.)
-- =============================================================================

revoke all on public.leads from anon;

grant insert (name, email, phone, company, service_type, message, source)
  on public.leads to anon;

grant select, insert, update, delete on public.leads to authenticated;
