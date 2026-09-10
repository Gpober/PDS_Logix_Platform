-- The piece-work crew is piece work only — clear every hourly rate that sits
-- alongside a unit rate.
--
-- 0032 did this for Daniel Restrepo. Munoz, Williams, Arevalo and Matthews held
-- both rates for the same reason, and the owner confirms all five are piece
-- work with no hourly component.
--
-- It matters because workerPay() in lib/crm/data.ts computes
--   total = hourlyPay + unitPay + salaryPay
-- and ADDS them. A man holding both rates is paid twice for the same vehicle in
-- the worker portal. Matthews was the clearest tell: $16.00 on both fields, the
-- same rate entered twice.
--
-- No retroactive effect: none of the five has a single row in time_entries,
-- ever. That is corroborating evidence rather than luck — the CR crew does not
-- use the time clock at all; only the photo crew (Delgado, Tinoco, Gonzalez,
-- Tua) appears in the Payroll A and B timesheets, and they are hourly with no
-- unit rate. The two pay bases are cleanly separated now:
--   piece work only : Restrepo, Munoz, Williams, Arevalo, Matthews
--   hourly only     : Delgado, Tinoco, Gonzalez, Tua
--
-- Guarded on `unit_rate is not null` so it cannot strip the rate from someone
-- who is genuinely hourly.

update staff
set hourly_rate = null, updated_at = now()
where unit_rate is not null and hourly_rate is not null;
