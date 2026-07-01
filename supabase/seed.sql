-- =============================================================================
-- PDS Logix Platform — seed.sql
-- A few sample clients / contacts / staff / assets / jobs + pricing.
-- Run AFTER 0001–0003, in the Supabase SQL editor (runs as a privileged role,
-- so RLS is bypassed and the pricing rows seed fine).
--
-- Intended to run ONCE on an empty database. Re-running will insert duplicates.
-- =============================================================================

with ins_clients as (
  insert into public.clients (name, category, website, phone)
  values
    ('Riverside Auto Group', 'dealership', 'https://riversideauto.example', '555-0110'),
    ('FleetCo Rentals',      'rental',     'https://fleetco.example',       '555-0120'),
    ('Summit Insurance',     'insurer',    'https://summonsins.example',    '555-0130')
  returning id, name
),
ins_staff as (
  insert into public.staff (name, title, email, phone)
  values
    ('Marcus Bell',  'Lead Inspector', 'marcus@pdslogix.example', '555-0201'),
    ('Dana Ortiz',   'Detailer',       'dana@pdslogix.example',   '555-0202'),
    ('Kyle Nguyen',  'Biohazard Tech', 'kyle@pdslogix.example',   '555-0203')
  returning id, name
),
ins_contacts as (
  insert into public.contacts (name, email, title, client_id)
  select 'Priya Shah', 'priya@riversideauto.example', 'Used Car Manager', c.id
  from ins_clients c where c.name = 'Riverside Auto Group'
  union all
  select 'Tom Becker', 'tom@fleetco.example', 'Operations Lead', c.id
  from ins_clients c where c.name = 'FleetCo Rentals'
  returning id
),
ins_assets as (
  insert into public.assets (client_id, vin, year, make, model, color, mileage, license_plate)
  select c.id, '1HGCM82633A004352', 2021, 'Honda', 'Accord', 'Silver', 41200, 'ABC1234'
  from ins_clients c where c.name = 'Riverside Auto Group'
  union all
  select c.id, '3FA6P0H73HR100001', 2019, 'Ford', 'Fusion', 'Black', 88000, 'FLT0090'
  from ins_clients c where c.name = 'FleetCo Rentals'
  returning id, vin, client_id
),
ins_jobs as (
  insert into public.jobs
    (client_id, asset_id, assigned_staff_id, service_type, status, scheduled_date, location)
  select
    a.client_id, a.id, s.id, 'condition_report'::public.service_type,
    'completed'::public.job_status, current_date - 5, 'Riverside lot A'
  from ins_assets a
  join ins_staff s on s.name = 'Marcus Bell'
  where a.vin = '1HGCM82633A004352'
  union all
  select
    a.client_id, a.id, s.id, 'detailing'::public.service_type,
    'scheduled'::public.job_status, current_date + 2, 'PDS shop'
  from ins_assets a
  join ins_staff s on s.name = 'Dana Ortiz'
  where a.vin = '3FA6P0H73HR100001'
  returning id, service_type
)
insert into public.job_pricing (job_id, price, cost)
select id, 89.00, 32.00 from ins_jobs where service_type = 'condition_report'
union all
select id, 275.00, 120.00 from ins_jobs where service_type = 'detailing';
