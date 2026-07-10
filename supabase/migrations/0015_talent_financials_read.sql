-- =============================================================================
-- Tulips Talent — 0015_talent_financials_read.sql
-- Lets a signed-in talent read the dollar breakdown for THEIR OWN deals, powering
-- the creator portal's paid/owed. Owner policy unchanged; members still get none.
-- Run AFTER 0014. Safe to re-run.
-- =============================================================================

drop policy if exists deal_financials_talent_read on public.deal_financials;
create policy deal_financials_talent_read on public.deal_financials
  for select to authenticated
  using (
    public.is_talent()
    and exists (
      select 1 from public.deals d
      where d.id = deal_financials.deal_id
        and d.talent_id = public.current_talent_id()
    )
  );
