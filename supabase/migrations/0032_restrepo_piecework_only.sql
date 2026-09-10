-- Daniel Restrepo is piece work only — clear his hourly rate.
--
-- He carried unit_rate 16.50 AND hourly_rate 16.00. workerPay() in
-- lib/crm/data.ts computes hourly + piece + salary and ADDS them, so holding
-- both rates means the worker portal pays a man twice for the same vehicle.
-- Restrepo is piece work only, so the hourly rate was not a guarantee sitting
-- underneath the piece rate — it was a second payment.
--
-- No retroactive effect: he has zero rows in time_entries, ever, so no past
-- pay calculation moves. This only prevents a future one from being wrong.
--
-- NOTE — still outstanding, deliberately NOT changed here: Munoz, Williams,
-- Arevalo and Matthews all still hold BOTH rates. If they are piece work only
-- too, the portal is overstating their pay the same way and they need the same
-- treatment. If their hourly is a genuine guarantee, workerPay is what needs
-- fixing, because adding the two is wrong either way. That is a pay-policy
-- question for the owner, not something to infer from the schema.
--
-- Guarded on `unit_rate is not null` so this cannot strip the hourly rate from
-- someone who is genuinely hourly.

update staff
set hourly_rate = null, updated_at = now()
where name = 'Daniel Restrepo' and unit_rate is not null;
