-- Headshots for the team roster (Tulips-style talent cards).
alter table staff add column if not exists headshot_url text;

-- Public bucket for staff headshots (uploaded by the team, unguessable paths).
insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', true)
on conflict (id) do nothing;

drop policy if exists staff_photos_insert on storage.objects;
create policy staff_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-photos'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('owner','admin','member'))
  );

drop policy if exists staff_photos_select on storage.objects;
create policy staff_photos_select on storage.objects
  for select to public
  using (bucket_id = 'staff-photos');
