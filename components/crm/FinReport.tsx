import Link from 'next/link';
import { Empty } from './ui';

export const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
export const usd2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

export function BooksNote() {
  return (
    <Empty>
      The books aren’t connected yet. Set <code>PDS_BOOKS_SUPABASE_URL</code> / <code>PDS_BOOKS_SUPABASE_KEY</code> in the
      environment (the same QuickBooks ledger the I AM CFO dashboards read), then reload.
    </Empty>
  );
}

export function Kpi({ label, value, sub, bad }: { label: string; value: string; sub?: string; bad?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-center">
      <p className="text-[11px] uppercase tracking-wider text-stone">{label}</p>
      <p className={'mt-1 font-display text-xl tabular-nums ' + (bad ? 'text-[#B91C1C]' : 'text-ink')}>{value}</p>
      {sub && <p className="text-[11px] text-stone">{sub}</p>}
    </div>
  );
}

export function StatRow({ label, value, muted, strong, bad, indent }: { label: string; value: string; muted?: boolean; strong?: boolean; bad?: boolean; indent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={(indent ? 'pl-3 ' : '') + (muted ? 'text-stone' : strong ? 'font-medium text-ink' : 'text-ink')}>{label}</span>
      <span className={'tabular-nums ' + (bad ? 'text-[#B91C1C]' : strong ? 'font-medium text-ink' : muted ? 'text-stone' : 'text-ink')}>{value}</span>
    </div>
  );
}

// Period selector (This month / Last month / Year to date) for a report tab.
export function PeriodChips({ basePath, current }: { basePath: string; current: string }) {
  const chip = (key: string, txt: string) => (
    <Link href={`${basePath}?period=${key}`}
      className={'rounded-full px-3 py-1.5 text-sm ' + (current === key ? 'bg-tulip text-ivory' : 'border border-line text-stone hover:border-ink')}>
      {txt}
    </Link>
  );
  return (
    <div className="flex items-center justify-center gap-2">
      {chip('month', 'This month')}
      {chip('last', 'Last month')}
      {chip('ytd', 'Year to date')}
    </div>
  );
}

// A section of account lines with a subtotal — used by P&L and Balance Sheet.
export function AccountSection({ title, lines, total, negate }: { title: string; lines: { account: string; amount: number }[]; total: number; negate?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-stone">{title}</p>
        <span className="font-display text-lg tabular-nums text-ink">{usd2(total)}</span>
      </div>
      <div className="space-y-1 border-t border-line pt-2 text-sm">
        {lines.length === 0 ? (
          <p className="text-stone">—</p>
        ) : (
          lines.map((l) => (
            <StatRow key={l.account} label={l.account} value={usd2(negate ? -l.amount : l.amount)} muted />
          ))
        )}
      </div>
    </div>
  );
}
