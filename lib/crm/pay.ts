// Bi-weekly pay periods, PDS-style: each period runs Thursday → Wednesday (14
// days) and is paid the Friday 9 days after it ends. Two staggered groups A and
// B run a week apart, so payroll goes out every Friday, alternating groups —
// each worker is on one group (staff.payroll_group).
//
// All math is UTC calendar-day math on YYYY-MM-DD strings so it never drifts
// with server timezone. Override the group-A anchor with PAY_PERIOD_ANCHOR
// (must be a Thursday that starts a real group-A period).

export type PayGroup = 'A' | 'B';

// A Thursday that begins a group-A period. Aligned to PDS's live schedule
// (payday Fri 2025-01-03 → period Thu 2024-12-12 … Wed 2024-12-25).
export const PAY_PERIOD_ANCHOR = process.env.PAY_PERIOD_ANCHOR || '2024-12-12';
export const PAY_PERIOD_DAYS = 14;
export const GROUP_B_OFFSET_DAYS = 7; // group B is one week after group A
export const PAY_DATE_LAG_DAYS = 9;   // payday = period end + 9 days (a Friday)

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

const anchorFor = (group: PayGroup) => (group === 'B' ? addDays(PAY_PERIOD_ANCHOR, GROUP_B_OFFSET_DAYS) : PAY_PERIOD_ANCHOR);

export interface PayPeriod {
  group: PayGroup;
  index: number;   // periods since this group's anchor (0 = the anchor period)
  start: string;   // inclusive YYYY-MM-DD (a Thursday)
  end: string;     // inclusive YYYY-MM-DD (a Wednesday, start + 13 days)
  payDate: string; // the Friday this period is paid (end + 9 days)
}

function build(group: PayGroup, index: number): PayPeriod {
  const start = addDays(anchorFor(group), index * PAY_PERIOD_DAYS);
  const end = addDays(start, PAY_PERIOD_DAYS - 1);
  return { group, index, start, end, payDate: addDays(end, PAY_DATE_LAG_DAYS) };
}

// The pay period (for a group) that contains a given day.
export function payPeriodContaining(dayIso: string, group: PayGroup = 'A'): PayPeriod {
  const days = Math.floor((toUtc(dayIso) - toUtc(anchorFor(group))) / MS_DAY);
  return build(group, Math.floor(days / PAY_PERIOD_DAYS));
}

export function payPeriodByIndex(index: number, group: PayGroup = 'A'): PayPeriod {
  return build(group, index);
}

export function shiftPayPeriod(period: PayPeriod, delta: number): PayPeriod {
  return build(period.group, period.index + delta);
}

const fmt = (iso: string, withYear: boolean) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

// e.g. "Jul 24 – Aug 6, 2026"
export function payPeriodLabel(period: PayPeriod): string {
  const sameYear = period.start.slice(0, 4) === period.end.slice(0, 4);
  return `${fmt(period.start, !sameYear)} – ${fmt(period.end, true)}`;
}

// e.g. "Fri Aug 15, 2026"
export function payDateLabel(period: PayPeriod): string {
  return new Date(`${period.payDate}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const asGroup = (v: unknown): PayGroup => (v === 'B' ? 'B' : 'A');
