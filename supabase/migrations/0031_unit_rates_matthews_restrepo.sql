-- Give Maximus Matthews and Daniel Restrepo the piece rates they are actually
-- paid at.
--
-- Both had unit_rate NULL while the daily P&L Routine paid them $16.00 and
-- $16.50 per piece. The Routine is right — confirmed with the owner — so the
-- database was the side that was wrong, and production_report was returning
-- piece_pay of $0.00 for two men who are genuinely on piece work.
--
-- That mattered because production_report is what the Connecteam MCP serves to
-- payroll questions: anyone pulling piece pay from the database rather than
-- from the Routine's own arithmetic saw two CR inspectors working for nothing.
-- For 2026-09-01..09 alone that understated CR labour by $4,687 of $9,781.
--
-- Guarded on `unit_rate is null` so re-running cannot overwrite a rate someone
-- has since changed by hand.

update staff set unit_rate = 16.00, updated_at = now()
where name = 'Maximus Matthews' and unit_rate is null;

update staff set unit_rate = 16.50, updated_at = now()
where name = 'Daniel Restrepo' and unit_rate is null;
