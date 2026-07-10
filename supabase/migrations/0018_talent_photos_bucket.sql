-- Storage bucket for talent headshots uploaded from the CRM.
-- Public read (so the marketing site can show the photos) + authenticated write.

insert into storage.buckets (id, name, public)
values ('talent-photos', 'talent-photos', true)
on conflict (id) do update set public = true;

-- Anyone can read (bucket is public; this also covers explicit SELECT).
drop policy if exists "talent photos public read" on storage.objects;
create policy "talent photos public read"
  on storage.objects for select
  using (bucket_id = 'talent-photos');

-- Signed-in CRM users can upload.
drop policy if exists "talent photos authenticated insert" on storage.objects;
create policy "talent photos authenticated insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'talent-photos');

-- Signed-in CRM users can replace / remove their uploads.
drop policy if exists "talent photos authenticated update" on storage.objects;
create policy "talent photos authenticated update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'talent-photos');

drop policy if exists "talent photos authenticated delete" on storage.objects;
create policy "talent photos authenticated delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'talent-photos');
