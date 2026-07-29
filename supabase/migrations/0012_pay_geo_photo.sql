-- Worker portal round 2: pay rates, car photos, and clock geolocation.

-- 1) Pay rates on the staff record. PDS pays a mix: an hourly base plus a
--    per-unit (piece-rate) amount, added together over a pay period. Owners set
--    these in the CRM; workers see their own on their profile.
alter table staff add column if not exists hourly_rate numeric;
alter table staff add column if not exists unit_rate numeric;

-- 2) A photo of the serviced vehicle, logged from the portal.
alter table production_entries add column if not exists photo_url text;

-- 3) Where a worker clocked in / out (best-effort GPS from the browser).
alter table time_entries add column if not exists clock_in_lat double precision;
alter table time_entries add column if not exists clock_in_lng double precision;
alter table time_entries add column if not exists clock_out_lat double precision;
alter table time_entries add column if not exists clock_out_lng double precision;

-- 4) Storage for car photos. Public bucket (low-sensitivity, unguessable UUID
--    paths) so the recent-entries list and owner views render straight from the
--    public URL. Uploads are restricted to signed-in team members.
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', true)
on conflict (id) do nothing;

drop policy if exists vehicle_photos_insert on storage.objects;
create policy vehicle_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member'))
  );

drop policy if exists vehicle_photos_select on storage.objects;
create policy vehicle_photos_select on storage.objects
  for select to public
  using (bucket_id = 'vehicle-photos');
