-- QuickBooks Online integration
-- One company-wide OAuth connection + links from CRM records to QBO objects.
-- (Applied to the live PDS Logix CRM project; mirrored here.)

create or replace function qbo_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table if not exists quickbooks_connection (
  id                        integer primary key default 1 check (id = 1),
  realm_id                  text not null,
  environment               text not null default 'production' check (environment in ('sandbox','production')),
  access_token              text not null,
  refresh_token             text not null,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  connected_by              uuid references auth.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table clients add column if not exists qbo_customer_id text;

alter table jobs add column if not exists qbo_invoice_id text;
alter table jobs add column if not exists qbo_invoice_status text;   -- paid | unpaid | partial
alter table jobs add column if not exists qbo_balance numeric;
alter table jobs add column if not exists qbo_synced_at timestamptz;

alter table quickbooks_connection enable row level security;
drop policy if exists qbo_conn_team_all on quickbooks_connection;
create policy qbo_conn_team_all on quickbooks_connection
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member')));

drop trigger if exists qbo_conn_set_updated_at on quickbooks_connection;
create trigger qbo_conn_set_updated_at before update on quickbooks_connection
  for each row execute function qbo_set_updated_at();
