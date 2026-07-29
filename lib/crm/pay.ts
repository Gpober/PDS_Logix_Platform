// Bi-weekly pay periods, anchored to a known Monday. Every period is a 14-day
// window [start, end] (both inclusive, YYYY-MM-DD). Override the anchor with
// PAY_PERIOD_ANCHOR (any date inside/at the start of a real period start).
//
// All math is UTC calendar-day math on YYYY-MM-DD strings so it never drifts
// with server timezone. Default anchor: Mon 2026-01-05.

export const PAY_PERIOD_ANCHOR = process.env.PAY_PERIOD_ANCHOR || '2026-01-05';
export const PAY_PERIOD_DAYS = 14;

const MS_DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * MS_DAY);
}

export interface PayPeriod {
  index: number; // periods since the anchor (0 = the anchor period)
  start: string; // inclusive YYYY-MM-DD
  end: string;   // inclusive YYYY-MM-DD (start + 13 days)
}

// The pay period that contains a given day.
export function payPeriodContaining(dayIso: string): PayPeriod {
  const days = Math.floor((toUtc(dayIso) - toUtc(PAY_PERIOD_ANCHOR)) / MS_DAY);
  const index = Math.floor(days / PAY_PERIOD_DAYS);
  const start = addDays(PAY_PERIOD_ANCHOR, index * PAY_PERIOD_DAYS);
  return { index, start, end: addDays(start, PAY_PERIOD_DAYS - 1) };
}

// Step forward/back by whole periods (for prev/next navigation).
export function shiftPayPeriod(period: PayPeriod, delta: number): PayPeriod {
  const start = addDays(PAY_PERIOD_ANCHOR, (period.index + delta) * PAY_PERIOD_DAYS);
  return { index: period.index + delta, start, end: addDays(start, PAY_PERIOD_DAYS - 1) };
}

// A period by its integer index (as used in URLs).
export function payPeriodByIndex(index: number): PayPeriod {
  const start = addDays(PAY_PERIOD_ANCHOR, index * PAY_PERIOD_DAYS);
  return { index, start, end: addDays(start, PAY_PERIOD_DAYS - 1) };
}

// A short human label, e.g. "Jul 27 – Aug 9, 2026".
export function payPeriodLabel(period: PayPeriod): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  const sameYear = period.start.slice(0, 4) === period.end.slice(0, 4);
  return `${fmt(period.start, !sameYear)} – ${fmt(period.end, true)}`;
}
