-- =============================================================================
-- Tulips Talent — verify_rls.sql
-- One-paste audit of the access model. Run any time in the Supabase SQL editor.
-- Nothing here changes data; it only reports.
-- =============================================================================

-- 1) RLS must be ENABLED on every table (policies are ignored when it isn't).
--    Every row must show rls_enabled = true.
select
  c.relname           as table,
  c.relrowsecurity    as rls_enabled,
  count(p.policyname) as policies
from pg_class c
left join pg_policies p
  on p.tablename = c.relname and p.schemaname = 'public'
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and c.relname in
    ('profiles','brands','agencies','people','talent','deals','deal_budgets','leads')
group by c.relname, c.relrowsecurity
order by c.relname;

-- 2) anon must have NO privileges on base tables (public site uses views only).
--    Expect ZERO rows.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
  and table_name in
    ('profiles','brands','agencies','people','talent','deals','deal_budgets')
order by table_name;

-- 3) anon CAN read the three public views and may INSERT (not select) leads.
--    Expect the three public_* views + leads INSERT only.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon'
  and table_schema = 'public'
order by table_name, privilege_type;

-- -----------------------------------------------------------------------------
-- 4) Live budget probe. Impersonate roles and confirm what each can see.
--    deal_budgets: owner sees rows, member/anon error or see nothing.
-- -----------------------------------------------------------------------------
-- As the anonymous (public) role:
set role anon;
  -- should ERROR (permission denied) — base tables are ungranted to anon:
  -- select * from public.deals;
  -- should ERROR — budget is unreachable:
  -- select * from public.deal_budgets;
  -- should WORK — only public, safe columns:
  select count(*) as anon_public_talent_rows from public.public_talent;
reset role;

-- Tip: to test a member, set a test profile's role to 'member' and sign in as
-- that user from the app, then run:  select id, budget from deals_with_budget;
-- Every budget must come back NULL.
