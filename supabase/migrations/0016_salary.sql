-- Salary / fixed pay: a flat amount paid each pay period ("per check"), on top
-- of any hourly + per-unit. Salaried admins carry this instead of an hourly rate.
alter table staff add column if not exists salary_per_check numeric;

-- Carry salary through the owner pay-roster RPC so the report totals include it.
create or replace function get_pay_roster(p_from date, p_to date)
returns jsonb
language sql
stable
as $$
  with shifts as (
    select staff_id, extract(epoch from (clock_out - clock_in)) / 3600.0 as h
    from time_entries
    where clock_out is not null
      and clock_in >= p_from and clock_in < (p_to + 1)
  ),
  hrs as (
    select staff_id,
           coalesce(sum(greatest(h - case when h >= 8 then 1 else 0 end, 0)), 0) as hours
    from shifts
    group by staff_id
  ),
  un as (
    select staff_id, count(*) as units
    from production_entries
    where staff_id is not null
      and submitted_at >= p_from and submitted_at < (p_to + 1)
    group by staff_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'staff_id', s.id,
    'name', s.name,
    'title', s.title,
    'is_active', s.is_active,
    'payroll_group', s.payroll_group,
    'email', s.email,
    'hourly_rate', s.hourly_rate,
    'unit_rate', s.unit_rate,
    'salary_per_check', s.salary_per_check,
    'hours', round(coalesce(h.hours, 0)::numeric, 2),
    'units', coalesce(u.units, 0)
  ) order by s.name), '[]'::jsonb)
  from staff s
  left join hrs h on h.staff_id = s.id
  left join un u on u.staff_id = s.id
  where s.is_active;
$$;
grant execute on function get_pay_roster(date, date) to authenticated, anon;
