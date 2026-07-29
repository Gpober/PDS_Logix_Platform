import { createServerSupabase } from '@/lib/supabase/server';
import { getCashFlow, getCompanyFinancials } from '@/lib/integrations/pdsbooks';
import { getPlaidCashTotal } from '@/lib/integrations/plaid';
import { payRoster } from './data';
import { payPeriodByIndex, payPeriodContaining, type PayGroup } from './pay';

// Smarter cash forecast: start from last Friday's end-of-day cash (Plaid, locked
// weekly), then roll forward week by week with real A/R due dates for money-in
// and A/P + live payroll accrual for money-out. Weeks end on Fridays (paydays).

const MS = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, '0');
const round2 = (n: number) => Math.round(n * 100) / 100;
const toU = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const fromU = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };
const addDays = (iso: string, n: number) => fromU(toU(iso) + n * MS);
const daysBetween = (a: string, b: string) => Math.round((toU(b) - toU(a)) / MS);
function isoToday(): string { const n = new Date(); return `${n.getUTCFullYear()}-${p2(n.getUTCMonth() + 1)}-${p2(n.getUTCDate())}`; }
// Most recent Friday strictly before `iso` (so on Saturday it's yesterday; on
// Friday it's a week ago — this Friday hasn't closed until Saturday).
function lastFridayBefore(iso: string): string {
  const dow = new Date(toU(iso)).getUTCDay(); // 0 Sun .. 6 Sat, Fri = 5
  const delta = ((dow - 5 + 7) % 7) || 7;
  return addDays(iso, -delta);
}

export interface ForecastAnchor { date: string; balance: number; source: 'plaid' | 'books' | 'manual'; capturedAt?: string; needsEntry?: boolean }
export interface ForecastItem { label: string; amount: number; date: string | null; kind: 'ar' | 'ap' | 'payroll' | 'adjust'; basis?: string }
export interface ForecastAdjustment { id: string; week_ending: string; label: string | null; amount: number; source: string }
export interface ForecastWeek { index: number; weekEnd: string; inflow: number; outflow: number; payroll: number; net: number; endingBalance: number; items: ForecastItem[] }
export interface CashForecast {
  anchor: ForecastAnchor;
  weeks: ForecastWeek[];
  horizonWeeks: number;
  lowPoint: { weekEnd: string; balance: number };
  totalIn: number;
  totalOut: number;
  booksConnected: boolean;
}

export async function listForecastAdjustments(): Promise<ForecastAdjustment[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('forecast_adjustments').select('id, week_ending, label, amount, source').order('week_ending');
  return (data ?? []) as ForecastAdjustment[];
}

// The anchor = last Friday's EOD cash. Captured once that Friday has closed
// (first load on/after Saturday), locked in a snapshot, and reused all week.
export async function getForecastAnchor(): Promise<ForecastAnchor> {
  const supabase = await createServerSupabase();
  const friday = lastFridayBefore(isoToday());

  // A snapshot for THIS Friday wins — a manually typed balance or a prior
  // live capture. It's tied to the specific Friday, so it locks for the week
  // and a new Friday (Saturday) starts fresh.
  const { data: snap } = await supabase.from('cash_balance_snapshots').select('*').eq('friday_date', friday).maybeSingle();
  if (snap) {
    const s = snap as { balance: number; source: ForecastAnchor['source']; captured_at: string };
    return { date: friday, balance: Number(s.balance), source: s.source, capturedAt: s.captured_at };
  }

  // No snapshot yet — try live sources, and only lock one when we actually have
  // a number. Otherwise leave it blank and prompt for a manual Friday balance.
  const plaid = await getPlaidCashTotal();
  if (plaid.connected) {
    await supabase.from('cash_balance_snapshots').upsert({ friday_date: friday, balance: plaid.total, source: 'plaid', captured_at: new Date().toISOString() }, { onConflict: 'friday_date' });
    return { date: friday, balance: plaid.total, source: 'plaid' };
  }
  const fin = await getCompanyFinancials();
  if (fin.status === 'ok') {
    await supabase.from('cash_balance_snapshots').upsert({ friday_date: friday, balance: fin.data.cashBalance, source: 'books', captured_at: new Date().toISOString() }, { onConflict: 'friday_date' });
    return { date: friday, balance: fin.data.cashBalance, source: 'books' };
  }
  return { date: friday, balance: 0, source: 'books', needsEntry: true };
}

// Payroll for a group's period: actual once the period has ended, otherwise an
// estimate — the current period accrues live (floored at last period's run rate),
// future periods use the run rate.
async function periodPayroll(group: PayGroup, index: number, today: string): Promise<{ amount: number; basis: string }> {
  const period = payPeriodByIndex(index, group);
  const roster = await payRoster(period.start, period.end, group);
  const total = round2(roster.reduce((s, r) => s + r.total, 0));
  if (period.end < today) return { amount: total, basis: 'actual' };
  const prev = payPeriodByIndex(index - 1, group);
  const prevRoster = await payRoster(prev.start, prev.end, group);
  const runRate = round2(prevRoster.reduce((s, r) => s + r.total, 0));
  const coversToday = period.start <= today && today <= period.end;
  return { amount: coversToday ? Math.max(total, runRate) : runRate, basis: coversToday ? 'accruing' : 'projected' };
}

export async function buildCashForecast(opts?: { weeks?: number }): Promise<CashForecast> {
  const weeks = Math.min(Math.max(Math.floor(opts?.weeks ?? 8), 1), 26);
  const supabase = await createServerSupabase();
  const anchor = await getForecastAnchor();
  const today = isoToday();
  const horizonEnd = addDays(anchor.date, 7 * weeks);

  // Which forecast week (1..weeks) a date lands in; overdue/now → week 1.
  const bucketOf = (dateIso: string | null): number | null => {
    const d = dateIso ?? today;
    if (d <= anchor.date) return 1;
    if (d > horizonEnd) return null;
    return Math.min(weeks, Math.max(1, Math.ceil(daysBetween(anchor.date, d) / 7)));
  };

  const wk: ForecastWeek[] = [];
  for (let i = 1; i <= weeks; i++) wk.push({ index: i, weekEnd: addDays(anchor.date, 7 * i), inflow: 0, outflow: 0, payroll: 0, net: 0, endingBalance: 0, items: [] });

  // Money in / out from the books (real due dates).
  const cf = await getCashFlow();
  const booksConnected = cf.status === 'ok';
  if (cf.status === 'ok') {
    for (const r of cf.data.dueReceivables) {
      const b = bucketOf(r.dueDate);
      if (b) { wk[b - 1].inflow += r.amount; wk[b - 1].items.push({ label: r.customer, amount: r.amount, date: r.dueDate, kind: 'ar' }); }
    }
    for (const r of cf.data.payables) {
      const b = bucketOf(r.dueDate);
      if (b) { wk[b - 1].outflow += r.amount; wk[b - 1].items.push({ label: r.vendor, amount: r.amount, date: r.dueDate, kind: 'ap' }); }
    }
  }

  // Payroll on each upcoming A/B payday (live accrual).
  for (const group of ['A', 'B'] as const) {
    const startIdx = payPeriodContaining(today, group).index - 1; // catch a just-passed payday too
    for (let k = 0; k <= weeks; k++) {
      const period = payPeriodByIndex(startIdx + k, group);
      if (period.payDate <= anchor.date) continue;
      if (period.payDate > horizonEnd) break;
      const b = bucketOf(period.payDate);
      if (!b) continue;
      const est = await periodPayroll(group, period.index, today);
      if (est.amount > 0) {
        wk[b - 1].outflow += est.amount;
        wk[b - 1].payroll += est.amount;
        wk[b - 1].items.push({ label: `Payroll ${group} · ${est.basis}`, amount: est.amount, date: period.payDate, kind: 'payroll', basis: est.basis });
      }
    }
  }

  // Manual adjustments (expected in/out the books don't know about). Signed:
  // positive = money in, negative = money out. Bucketed by their Friday.
  const { data: adj } = await supabase.from('forecast_adjustments').select('id, week_ending, label, amount');
  for (const a of (adj ?? []) as { week_ending: string; label: string | null; amount: number }[]) {
    const b = bucketOf(a.week_ending);
    if (!b) continue;
    const amt = Number(a.amount);
    if (amt >= 0) wk[b - 1].inflow += amt;
    else wk[b - 1].outflow += Math.abs(amt);
    wk[b - 1].items.push({ label: a.label || 'Adjustment', amount: Math.abs(amt), date: a.week_ending, kind: 'adjust', basis: amt >= 0 ? 'in' : 'out' });
  }

  // Roll forward from the anchor.
  let running = anchor.balance;
  let low = { weekEnd: anchor.date, balance: running };
  let totalIn = 0;
  let totalOut = 0;
  for (const w of wk) {
    w.inflow = round2(w.inflow);
    w.outflow = round2(w.outflow);
    w.payroll = round2(w.payroll);
    w.net = round2(w.inflow - w.outflow);
    running = round2(running + w.net);
    w.endingBalance = running;
    totalIn += w.inflow;
    totalOut += w.outflow;
    if (running < low.balance) low = { weekEnd: w.weekEnd, balance: running };
    w.items.sort((a, b) => b.amount - a.amount);
  }

  return { anchor, weeks: wk, horizonWeeks: weeks, lowPoint: low, totalIn: round2(totalIn), totalOut: round2(totalOut), booksConnected };
}
