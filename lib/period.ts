import { cookies } from 'next/headers';

// A global, cookie-backed reporting time frame shared across the CRM. Stored in
// cookies (set by the header PeriodPicker) so it persists across every page and
// is readable server-side. `from`/`to` are inclusive YYYY-MM-DD, or null for
// "all time".
export type PeriodKey = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';

export interface PeriodRange {
  key: PeriodKey;
  label: string;
  from: string | null;
  to: string | null;
}

const LABELS: Record<PeriodKey, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
  quarter: 'This quarter',
  year: 'This year',
  all: 'All time',
  custom: 'Custom range',
};

// Local (not UTC) YYYY-MM-DD so period boundaries don't shift across timezones.
function fmt(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export async function getPeriod(): Promise<PeriodRange> {
  const store = await cookies();
  const key = (store.get('tt_period')?.value as PeriodKey) || 'all';
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  switch (key) {
    case 'day':
      return { key, label: LABELS.day, from: fmt(new Date(y, m, d)), to: fmt(new Date(y, m, d)) };
    case 'week': {
      const diffToMon = (now.getDay() + 6) % 7; // Monday-based week start
      const from = new Date(y, m, d - diffToMon);
      const to = new Date(y, m, d - diffToMon + 6);
      return { key, label: LABELS.week, from: fmt(from), to: fmt(to) };
    }
    case 'month':
      return {
        key,
        label: LABELS.month,
        from: fmt(new Date(y, m, 1)),
        to: fmt(new Date(y, m + 1, 0)),
      };
    case 'quarter': {
      const q = Math.floor(m / 3);
      return {
        key,
        label: LABELS.quarter,
        from: fmt(new Date(y, q * 3, 1)),
        to: fmt(new Date(y, q * 3 + 3, 0)),
      };
    }
    case 'year':
      return {
        key,
        label: LABELS.year,
        from: fmt(new Date(y, 0, 1)),
        to: fmt(new Date(y, 11, 31)),
      };
    case 'custom':
      return {
        key,
        label: LABELS.custom,
        from: store.get('tt_from')?.value || null,
        to: store.get('tt_to')?.value || null,
      };
    default:
      return { key: 'all', label: LABELS.all, from: null, to: null };
  }
}
