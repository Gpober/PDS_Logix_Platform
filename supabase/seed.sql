-- =============================================================================
-- Tulips Talent CRM — seed.sql
-- A few sample companies / talent / contacts / deals + budgets.
-- Run AFTER 0001–0036, in the Supabase SQL editor (runs as a privileged role,
-- so RLS is bypassed and the budget rows seed fine).
--
-- Intended to run ONCE on an empty database. Re-running will insert duplicates.
-- =============================================================================

with ins_companies as (
  insert into public.companies (name, type, category, employee_count, website)
  values
    ('111Skin',             'brand',  'Beauty',  120,  'https://www.111skin.com'),
    ('Abercrombie & Fitch', 'brand',  'Apparel', 8000, 'https://www.abercrombie.com'),
    ('Glossier',            'brand',  'Beauty',  300,  'https://www.glossier.com'),
    ('WME',                 'agency', null,      null, 'https://www.wmeagency.com'),
    ('CAA',                 'agency', null,      null, 'https://www.caa.com')
  returning id, name
),
ins_talent as (
  insert into public.talent (name, handle, category)
  values
    ('Ava Reyes',  '@avareyes',  'Lifestyle'),
    ('Liam Chen',  '@liamchen',  'Fitness'),
    ('Noah Patel', '@noahpatel', 'Beauty')
  returning id, name
),
ins_contacts as (
  insert into public.contacts (name, email, title, company_id, is_primary)
  select 'Sarah Lane', 'sarah@111skin.com', 'Brand Manager', c.id, true
  from ins_companies c where c.name = '111Skin'
  union all
  select 'Mia Donovan', 'mia@glossier.com', 'Partnerships Lead', c.id, true
  from ins_companies c where c.name = 'Glossier'
  union all
  select 'Tom Reed', 'tom@wme.com', 'Agent', c.id, true
  from ins_companies c where c.name = 'WME'
  returning id
),
ins_deals as (
  insert into public.deals (company_id, talent_id, booking_date, status, live_url, notes)
  select
    c.id,
    t.id,
    d.booking_date,
    d.status::public.deal_status,
    d.live_url,
    d.notes
  from (values
    ('111Skin',             'Ava Reyes',  date '2026-05-10', 'live',      'https://instagram.com/p/abc123', 'Spring skincare campaign'),
    ('111Skin',             'Liam Chen',  date '2026-03-02', 'completed', 'https://instagram.com/p/def456', 'Q1 collaboration'),
    ('Glossier',            'Ava Reyes',  date '2026-06-01', 'confirmed', null,                              'Summer launch — content TBD'),
    ('Abercrombie & Fitch', 'Noah Patel', date '2026-04-15', 'completed', 'https://tiktok.com/@x/video/1',  'Denim drop'),
    ('Glossier',            'Noah Patel', date '2026-02-20', 'pitched',   null,                              'Awaiting brief')
  ) as d(company_name, talent_name, booking_date, status, live_url, notes)
  join ins_companies c on c.name = d.company_name
  join ins_talent t on t.name = d.talent_name
  returning id, booking_date
)
insert into public.deal_budgets (deal_id, budget)
select
  id,
  case booking_date
    when date '2026-05-10' then 15000.00
    when date '2026-03-02' then 8000.00
    when date '2026-06-01' then 20000.00
    when date '2026-04-15' then 12000.00
    else 5000.00
  end
from ins_deals;

-- Promote the owner. Runs only if that user has already been created in Auth;
-- otherwise it's a no-op and you can re-run this one statement after signup.
update public.profiles p
set role = 'owner'
from auth.users u
where u.id = p.id
  and u.email = 'gpober06@gmail.com';
