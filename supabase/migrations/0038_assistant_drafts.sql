-- =============================================================================
-- Tulips Talent CRM — 0038_assistant_drafts.sql
-- Outreach drafts composed by the Iris assistant (Tier 3). Drafting flows
-- freely; SENDING is deliberately not built here — a draft only ever lands in
-- this table for a human to review, copy, and send from their own mail. The
-- `status` column reserves room for a future, gated "sent" transition.
-- Additive + safe to re-run. Run AFTER 0037.
-- =============================================================================

create table if not exists public.assistant_drafts (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  kind        text not null default 'other'
                check (kind in ('pitch', 'follow_up', 'reply', 'other')),
  to_name     text,
  to_email    text,
  subject     text not null,
  body        text not null,
  -- Optional context this draft was written from (all soft references).
  lead_id     uuid references public.leads(id) on delete set null,
  talent_id   uuid references public.talent(id) on delete set null,
  company_id  uuid references public.companies(id) on delete set null,
  status      text not null default 'draft' check (status in ('draft', 'sent', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_assistant_drafts_created_at on public.assistant_drafts(created_at desc);

drop trigger if exists trg_assistant_drafts_updated_at on public.assistant_drafts;
create trigger trg_assistant_drafts_updated_at before update on public.assistant_drafts
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.assistant_drafts to authenticated;

alter table public.assistant_drafts enable row level security;

-- Owner/admin only — the assistant is owner/admin-only, and so are its drafts.
drop policy if exists assistant_drafts_all on public.assistant_drafts;
create policy assistant_drafts_all on public.assistant_drafts
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
