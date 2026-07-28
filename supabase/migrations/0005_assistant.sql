-- Zordon assistant — write-side storage: drafts, memory, and visual reports.
--
-- These back the assistant's outreach drafts, durable memory, and the report
-- builder. All three are OWNER/ADMIN only (members get a read-only assistant),
-- enforced by the is_owner_admin() helper below. Mirrors the deployed project.

-- Helper: is the caller an owner or admin? (Tighter than is_team(), which also
-- lets members in.)
create or replace function is_owner_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'admin')
  );
$$;

-- ---- Drafts ----------------------------------------------------------------
-- Outreach emails Zordon composed. Saved, never sent — the team reads them on
-- the Drafts page and sends from their own mail.
create table if not exists assistant_drafts (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'other' check (kind in ('follow_up','quote','reply','other')),
  subject     text not null,
  body        text not null,
  to_name     text,
  to_email    text,
  lead_id     uuid references public.leads (id) on delete set null,
  client_id   uuid references public.clients (id) on delete set null,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists assistant_drafts_created_at_idx on assistant_drafts (created_at desc);

-- ---- Memory ----------------------------------------------------------------
-- Durable facts Zordon carries across every conversation.
create table if not exists assistant_memory (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  category    text not null default 'general' check (category in ('business','client','operations','preference','general')),
  subject     text,
  client_id   uuid references public.clients (id) on delete set null,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists assistant_memory_created_at_idx on assistant_memory (created_at desc);

-- ---- Reports ---------------------------------------------------------------
-- Visual reports Zordon composes: a title, a narrative summary, and an ordered
-- list of blocks (kpis / bar / line / table / callout / text) stored as JSON.
create table if not exists assistant_reports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  summary     text,
  blocks      jsonb not null default '[]'::jsonb,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists assistant_reports_created_at_idx on assistant_reports (created_at desc);

-- ---- RLS: owner/admin only -------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['assistant_drafts','assistant_memory','assistant_reports']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_oa_all on public.%I', t, t);
    execute format(
      'create policy %I_oa_all on public.%I for all using (is_owner_admin()) with check (is_owner_admin())',
      t, t
    );
  end loop;
end $$;
