-- =============================================================================
-- Tulips Talent CRM — 0039_assistant_memory.sql
-- Durable memory for the Iris assistant (Tier 4). Long-lived facts about the
-- business, talent, and brands that Iris should carry across sessions —
-- loaded into her system prompt and added via her `remember` tool. Owner/admin
-- only. Additive + safe to re-run. Run AFTER 0038.
-- =============================================================================

create table if not exists public.assistant_memory (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  content     text not null,
  category    text not null default 'general'
                check (category in ('business', 'talent', 'brand', 'preference', 'general')),
  subject     text,               -- freeform: who/what this is about
  talent_id   uuid references public.talent(id) on delete set null,
  company_id  uuid references public.companies(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_assistant_memory_created_at on public.assistant_memory(created_at desc);

drop trigger if exists trg_assistant_memory_updated_at on public.assistant_memory;
create trigger trg_assistant_memory_updated_at before update on public.assistant_memory
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.assistant_memory to authenticated;

alter table public.assistant_memory enable row level security;

drop policy if exists assistant_memory_all on public.assistant_memory;
create policy assistant_memory_all on public.assistant_memory
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
