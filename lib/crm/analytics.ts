// Pure aggregators that turn raw deal / content / follower rows into the monthly
// and daily series the analytics charts render. Kept framework-free so both the
// creator portal and the staff talent page can share them.

export type EarningRow = {
  booking_date: string | null;
  status: string;
  invoice_number: string | null;
  gross: number | null;
};

export type CadenceRow = {
  scheduled_at: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  status: string;
};

export type SnapshotRow = { captured_on: string; followers: number };

export type MonthEarning = { key: string; label: string; booked: number; paid: number; owed: number };
export type MonthCadence = { key: string; label: string; planned: number; published: number };
export type DayFollowers = { date: string; total: number };

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Build an ordered list of the last `months` month-keys ending at the current
// month, e.g. ['2025-08', … , '2026-07'].
function lastMonths(months: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: MONTH_LABELS[d.getMonth()] });
  }
  return out;
}

const monthKey = (iso: string) => iso.slice(0, 7); // 'YYYY-MM'

export function monthlyEarnings(deals: EarningRow[], months = 12): MonthEarning[] {
  const buckets = lastMonths(months).map((m) => ({ ...m, booked: 0, paid: 0, owed: 0 }));
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const d of deals) {
    if (!d.booking_date) continue;
    const b = index.get(monthKey(d.booking_date));
    if (!b) continue;
    const gross = Number(d.gross) || 0;
    b.booked += gross;
    if (d.status === 'completed') b.paid += gross;
    else if (d.invoice_number) b.owed += gross;
  }
  return buckets;
}

export function monthlyCadence(posts: CadenceRow[], months = 12): MonthCadence[] {
  const buckets = lastMonths(months).map((m) => ({ ...m, planned: 0, published: 0 }));
  const index = new Map(buckets.map((b) => [b.key, b]));
  for (const p of posts) {
    if (p.status === 'posted' && p.published_at) {
      const b = index.get(monthKey(p.published_at));
      if (b) b.published += 1;
    } else {
      const when = p.scheduled_at ?? p.scheduled_for;
      if (!when) continue;
      const b = index.get(monthKey(when));
      if (b) b.planned += 1;
    }
  }
  return buckets;
}

// Collapse per-account daily snapshots into a total-followers-per-day series.
export function dailyFollowers(snapshots: SnapshotRow[]): DayFollowers[] {
  const byDay = new Map<string, number>();
  for (const s of snapshots) {
    byDay.set(s.captured_on, (byDay.get(s.captured_on) ?? 0) + (Number(s.followers) || 0));
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, total]) => ({ date, total }));
}
