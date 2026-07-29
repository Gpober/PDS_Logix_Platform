-- Plaid items: one row per connected bank "Item". Holds the Plaid access_token,
-- which is SECRET — RLS is enabled with NO policies so the anon/authenticated
-- API roles can never read it. Only the service-role server routes (which bypass
-- RLS) touch this table. Single-tenant (this platform serves one company).
create table if not exists plaid_items (
  item_id           text        primary key,
  access_token      text        not null,
  institution_name  text,
  created_at        timestamptz not null default now()
);

alter table plaid_items enable row level security;
-- Intentionally no policies: deny all except the service role.
