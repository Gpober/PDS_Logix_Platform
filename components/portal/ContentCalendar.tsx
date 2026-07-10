import Link from 'next/link';
import { platformIcon } from '@/lib/platforms';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const statusDot: Record<string, string> = {
  idea: 'bg-stone',
  draft: 'bg-tulip',
  scheduled: 'bg-tulip-dark',
  posted: 'bg-[#5B8C5A]',
  failed: 'bg-red-500',
};

// Minimal shape the grid needs — satisfied by both ContentPost (creator portal)
// and AdminContentPost (staff view). `label` is an optional prefix on each entry,
// used by the staff calendar to show which creator a post belongs to.
export type CalendarPost = {
  id: string;
  scheduled_for: string | null;
  status: string;
  platform: string;
  caption: string | null;
  label?: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const shiftMonth = (y: number, m: number, delta: number) => {
  const idx = (m - 1) + delta;
  const ny = y + Math.floor(idx / 12);
  const nm = ((idx % 12) + 12) % 12;
  return `${ny}-${pad(nm + 1)}`;
};

// Month grid of scheduled posts. `month` is 'YYYY-MM'; navigation is via ?month=.
// `basePath` is where the ← → links point (the creator portal by default, or the
// staff content page).
export function ContentCalendar({
  posts,
  month,
  basePath = '/portal/content',
  extraQuery = '',
}: {
  posts: CalendarPost[];
  month: string;
  basePath?: string;
  // Extra query string (e.g. active filters) preserved across month navigation.
  extraQuery?: string;
}) {
  const suffix = extraQuery ? `&${extraQuery}` : '';
  const [y, m] = month.split('-').map(Number);
  const startWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const byDay = new Map<string, CalendarPost[]>();
  for (const p of posts) {
    if (!p.scheduled_for) continue;
    const arr = byDay.get(p.scheduled_for) ?? [];
    arr.push(p);
    byDay.set(p.scheduled_for, arr);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <Link
          href={`${basePath}?month=${shiftMonth(y, m, -1)}${suffix}`}
          className="rounded-full border border-line px-3 py-1 text-sm text-stone hover:border-ink"
        >
          ←
        </Link>
        <h3 className="font-display text-lg">{label}</h3>
        <Link
          href={`${basePath}?month=${shiftMonth(y, m, 1)}${suffix}`}
          className="rounded-full border border-line px-3 py-1 text-sm text-stone hover:border-ink"
        >
          →
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[0.65rem] uppercase tracking-wider text-stone">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="min-h-[68px] rounded-lg" />;
          const dateStr = `${y}-${pad(m)}-${pad(d)}`;
          const dayPosts = byDay.get(dateStr) ?? [];
          return (
            <div key={dateStr} className="min-h-[68px] rounded-lg border border-line/60 p-1">
              <div className="text-right text-[0.7rem] text-stone">{d}</div>
              <div className="mt-0.5 space-y-0.5">
                {dayPosts.slice(0, 3).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-1 truncate rounded bg-blush/50 px-1 py-0.5 text-[0.65rem] text-ink"
                    title={[p.label, p.caption ?? p.platform].filter(Boolean).join(' — ')}
                  >
                    <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${statusDot[p.status] ?? 'bg-stone'}`} />
                    <span aria-hidden>{platformIcon(p.platform)}</span>
                    <span className="truncate">
                      {p.label && <span className="font-medium">{p.label}: </span>}
                      {p.caption ?? p.status}
                    </span>
                  </div>
                ))}
                {dayPosts.length > 3 && (
                  <div className="px-1 text-[0.6rem] text-stone">+{dayPosts.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-stone">
        {Object.entries(statusDot).map(([s, c]) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${c}`} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
