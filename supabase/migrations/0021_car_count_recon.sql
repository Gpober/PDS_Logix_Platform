-- Car-count reconciliation: our units vs the auction's (Manheim) unit list.
--
-- A "batch" is one reconciliation — typically one Manheim statement/file for a
-- location and period. Their units land in recon_units (side = 'theirs'). Our
-- side is normally the production log (production_entries) scoped to the same
-- location + window; if the team uploads our own count file instead, those rows
-- land in recon_units (side = 'ours') and take precedence.
--
-- Matching is by VIN (normalized to the last 6 alphanumerics, uppercased),
-- counting duplicates: a VIN done twice on our side and once on theirs leaves
-- one unit unmatched on ours. Rows without a usable VIN are reported separately
-- as 'no_vin' rather than being silently dropped.

create table if not exists recon_batches (
  id            uuid primary key default gen_random_uuid(),
  label         text not null,
  counterparty  text not null default 'Manheim',
  location      text,                 -- scopes our production log; null = all locations
  period_start  date,
  period_end    date,
  ours_file     text,
  theirs_file   text,
  ours_rows     int not null default 0,
  theirs_rows   int not null default 0,
  note          text,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists recon_batches_created_at_idx on recon_batches (created_at desc);

create table if not exists recon_units (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references recon_batches (id) on delete cascade,
  side          text not null check (side in ('ours', 'theirs')),
  external_ref  text,                 -- their work order / invoice / line id
  vin           text,
  vin6          text,                 -- last 6 alphanumerics, uppercased (the match key)
  serviced_on   date,
  location      text,
  service_type  text,
  vehicle_desc  text,
  amount        numeric(12,2),
  raw           jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists recon_units_batch_side_idx on recon_units (batch_id, side);
create index if not exists recon_units_vin6_idx on recon_units (batch_id, side, vin6);

alter table recon_batches enable row level security;
alter table recon_units enable row level security;

drop policy if exists recon_batches_owner_admin on recon_batches;
create policy recon_batches_owner_admin on recon_batches
  for all using (is_owner_admin()) with check (is_owner_admin());

drop policy if exists recon_units_owner_admin on recon_units;
create policy recon_units_owner_admin on recon_units
  for all using (is_owner_admin()) with check (is_owner_admin());

-- ---------------------------------------------------------------------------
-- The reconciled row set: every unit on both sides, tagged matched /
-- only_ours / only_theirs / no_vin. Summary and detail both read from here so
-- the two can never disagree.
create or replace function recon_rows(p_batch_id uuid)
returns table (
  side text,
  vin6 text,
  vin text,
  serviced_on date,
  location text,
  service_type text,
  vehicle_desc text,
  external_ref text,
  amount numeric,
  staff_name text,
  status text
)
language sql
stable
set search_path = public
as $$
  with b as (
    select * from recon_batches where id = p_batch_id
  ),
  theirs_src as (
    select u.vin6, u.vin, u.serviced_on, u.location, u.service_type, u.vehicle_desc,
           u.external_ref, u.amount, null::text as staff_name
    from recon_units u
    where u.batch_id = p_batch_id and u.side = 'theirs'
  ),
  ours_file as (
    select u.vin6, u.vin, u.serviced_on, u.location, u.service_type, u.vehicle_desc,
           u.external_ref, u.amount, null::text as staff_name
    from recon_units u
    where u.batch_id = p_batch_id and u.side = 'ours'
  ),
  win as (
    select
      b.location as loc,
      coalesce(b.period_start, (select min(serviced_on) from theirs_src)) as d_from,
      coalesce(b.period_end,   (select max(serviced_on) from theirs_src)) as d_to,
      exists (select 1 from ours_file) as use_file,
      exists (select 1 from theirs_src) as has_theirs
    from b
  ),
  -- Our side: the uploaded file when there is one, otherwise the production log
  -- scoped to the batch's location + window. With nothing loaded on their side
  -- there is nothing to reconcile against, so our log stays out — otherwise a
  -- half-set-up batch would read as a variance the size of the whole log.
  ours_src as (
    select * from ours_file where (select use_file from win)
    union all
    select
      p.vin_last6 as vin6,
      p.vin_last6 as vin,
      p.submitted_at::date as serviced_on,
      p.location,
      p.service_type,
      nullif(concat_ws(' ', p.vehicle_year::text, p.model_type), '') as vehicle_desc,
      p.work_order_number as external_ref,
      null::numeric as amount,
      p.staff_name
    from production_entries p, win
    where not win.use_file
      and win.has_theirs
      and (win.loc is null or p.location = win.loc)
      and (win.d_from is null or p.submitted_at >= win.d_from)
      and (win.d_to is null or p.submitted_at < win.d_to + 1)
  ),
  all_rows as (
    select 'ours'::text as side, * from ours_src
    union all
    select 'theirs'::text as side, * from theirs_src
  ),
  -- One normalization for both sides so a full VIN and a last-6 still match.
  keyed as (
    select
      a.*,
      nullif(upper(right(regexp_replace(coalesce(nullif(a.vin6, ''), nullif(a.vin, ''), ''), '[^A-Za-z0-9]', '', 'g'), 6)), '') as k
    from all_rows a
  ),
  counts as (
    select k,
           count(*) filter (where side = 'ours') as o_n,
           count(*) filter (where side = 'theirs') as t_n
    from keyed
    where k is not null
    group by k
  ),
  ranked as (
    select keyed.*,
           row_number() over (partition by side, k order by serviced_on nulls last, external_ref nulls last) as rn
    from keyed
  )
  select
    r.side,
    r.k as vin6,
    r.vin,
    r.serviced_on,
    r.location,
    r.service_type,
    r.vehicle_desc,
    r.external_ref,
    r.amount,
    r.staff_name,
    case
      when r.k is null then 'no_vin'
      when r.rn <= least(c.o_n, c.t_n) then 'matched'
      when r.side = 'ours' then 'only_ours'
      else 'only_theirs'
    end as status
  from ranked r
  left join counts c on c.k = r.k;
$$;
grant execute on function recon_rows(uuid) to authenticated;

-- Aggregate scorecard for one batch: both counts, the variance, what matched,
-- what only one side has (with the dollars attached to their side), and the
-- day / location breakdown that shows where the gap opened up.
create or replace function get_recon_summary(p_batch_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with r as (select * from recon_rows(p_batch_id)),
  b as (select * from recon_batches where id = p_batch_id)
  select jsonb_build_object(
    'batch', (select to_jsonb(b.*) from b),
    'ours_source', (select case when exists (select 1 from recon_units u where u.batch_id = p_batch_id and u.side = 'ours')
                                then 'uploaded_file' else 'production_log' end),
    'ours_units', (select count(*) from r where side = 'ours'),
    'theirs_units', (select count(*) from r where side = 'theirs'),
    'variance', (select count(*) filter (where side = 'ours') - count(*) filter (where side = 'theirs') from r),
    'matched_units', (select count(*) from r where side = 'theirs' and status = 'matched'),
    'only_ours', (select count(*) from r where status = 'only_ours'),
    'only_theirs', (select count(*) from r where status = 'only_theirs'),
    'no_vin_ours', (select count(*) from r where side = 'ours' and status = 'no_vin'),
    'no_vin_theirs', (select count(*) from r where side = 'theirs' and status = 'no_vin'),
    -- Rate over their units that CAN match (a line with no VIN never can), so a
    -- file full of blank VINs reads as unmatchable rather than as a bad match.
    'match_rate', (select case when count(*) filter (where side = 'theirs' and status <> 'no_vin') = 0 then 0
                               else round(100.0 * count(*) filter (where side = 'theirs' and status = 'matched')
                                          / count(*) filter (where side = 'theirs' and status <> 'no_vin'), 1) end from r),
    'their_amount_total', (select coalesce(sum(amount), 0) from r where side = 'theirs'),
    'amount_only_theirs', (select coalesce(sum(amount), 0) from r where side = 'theirs' and status = 'only_theirs'),
    'amount_only_ours', (select coalesce(sum(amount), 0) from r where side = 'ours' and status = 'only_ours'),
    'date_from', (select min(serviced_on) from r),
    'date_to', (select max(serviced_on) from r),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d::text, 'ours', o, 'theirs', t, 'variance', o - t) order by d), '[]'::jsonb)
               from (select serviced_on d,
                            count(*) filter (where side = 'ours') o,
                            count(*) filter (where side = 'theirs') t
                     from r where serviced_on is not null group by 1) x),
    'by_location', (select coalesce(jsonb_agg(jsonb_build_object('location', loc, 'ours', o, 'theirs', t, 'variance', o - t) order by (o + t) desc), '[]'::jsonb)
                    from (select coalesce(location, 'Unspecified') loc,
                                 count(*) filter (where side = 'ours') o,
                                 count(*) filter (where side = 'theirs') t
                          from r group by 1) x),
    'by_service', (select coalesce(jsonb_agg(jsonb_build_object('service_type', svc, 'ours', o, 'theirs', t, 'variance', o - t) order by (o + t) desc), '[]'::jsonb)
                   from (select coalesce(service_type, 'Unspecified') svc,
                                count(*) filter (where side = 'ours') o,
                                count(*) filter (where side = 'theirs') t
                         from r group by 1) x)
  );
$$;
grant execute on function get_recon_summary(uuid) to authenticated;

-- The rows behind a number — filter to one status ('only_theirs', 'only_ours',
-- 'matched', 'no_vin') or omit for everything. Paginated.
create or replace function get_recon_exceptions(
  p_batch_id uuid,
  p_status text default null,
  p_side text default null,
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with f as (
    select * from recon_rows(p_batch_id)
    where (p_status is null or status = p_status)
      and (p_side is null or side = p_side)
  )
  select jsonb_build_object(
    'count', (select count(*) from f),
    'rows', (
      select coalesce(jsonb_agg(to_jsonb(x.*)), '[]'::jsonb)
      from (
        select * from f
        order by serviced_on nulls last, vin6 nulls last
        limit greatest(coalesce(p_limit, 100), 1)
        offset greatest(coalesce(p_offset, 0), 0)
      ) x
    )
  );
$$;
grant execute on function get_recon_exceptions(uuid, text, text, int, int) to authenticated;
