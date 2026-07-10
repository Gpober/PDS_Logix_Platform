-- =============================================================================
-- Tulips Talent — 0017_add_admin_jessica.sql
-- Promote jessica@tulipstalent.co to the 'admin' role (full CRM + budget).
-- Follows the same email-matched promotion pattern as seed.sql's owner promote.
--
-- Runs only if that user has already been created in Auth (invite-only signup);
-- otherwise it's a harmless no-op and you can re-run this one statement after
-- the account is created. Safe to re-run.
-- =============================================================================

update public.profiles p
set role = 'admin'
from auth.users u
where u.id = p.id
  and lower(u.email) = 'jessica@tulipstalent.co';
