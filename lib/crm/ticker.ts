import { getSalesAnalytics } from '@/lib/crm/salesAnalytics';

// Talent-performance ticker — an ESPN-style leaderboard crawl of the roster's
// numbers for the year: each creator's secured revenue and deal count, ranked,
// plus a lead-in with the year's totals. Owner/admin only (amounts come back
// zero otherwise via RLS). Single analytics read, cheap to poll.

export type TickerTone = 'up' | 'warn' | 'info';

export interface TickerItem {
  label: string;
  value: string;
  tone: TickerTone;
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// A rank badge for the top three, then plain numbers.
const rankBadge = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);

export async function getTickerHighlights(): Promise<TickerItem[]> {
  try {
    const a = await getSalesAnalytics();
    const items: TickerItem[] = [];

    // Lead-in: the year's roster totals for context.
    items.push({ label: `${a.year} TALENT PERFORMANCE`, value: `${usd(a.ytdAmount)} · ${a.ytdCount} deals`, tone: 'up' });

    // The leaderboard: every creator who booked this year, ranked by revenue.
    // matrix.rows carry per-talent totals (budget, falling back to gross).
    const rows = a.matrix.rows;
    rows.forEach((r, i) => {
      const deals = r.totalCount;
      items.push({
        label: `${rankBadge(i)} ${r.name}`,
        value: `${usd(r.total)} · ${deals} deal${deals === 1 ? '' : 's'}`,
        tone: i < 3 ? 'up' : 'info',
      });
    });

    // Who's owed a payout right now (a live "money out" flag), talent-scoped.
    if (a.apByTalent[0]) {
      items.push({
        label: 'OWED TO TALENT',
        value: `${a.apByTalent[0].name} · ${usd(a.apByTalent[0].amount)}`,
        tone: 'warn',
      });
    }

    // If nothing booked yet this year, still show something rather than nothing.
    if (rows.length === 0) {
      items.push({ label: 'ROSTER', value: 'No booked deals yet this year', tone: 'info' });
    }

    return items;
  } catch {
    return [];
  }
}
