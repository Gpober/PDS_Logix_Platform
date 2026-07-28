-- Map a CRM client to its exact QuickBooks customer DisplayName, for when the
-- CRM display name differs from the QBO name (e.g. CRM "Manheim - Dallas" vs a
-- different name in the Pride Dealer Services QBO). Invoicing sends this value
-- (falling back to clients.name) so it links to the right QBO customer instead
-- of creating a duplicate. Additive + safe to re-run.

alter table clients add column if not exists qbo_customer_name text;
