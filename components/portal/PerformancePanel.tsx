'use client';

import { useMemo, useState } from 'react';
import type { PortalDeal } from '@/lib/crm/data';

type Account = { platform: string; handle: string | null; followers: number | null };

type Period = 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
type CardKey = 'reach' | 'paid' | 'owed' | 'total';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

const fmtCount = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
      : `${n}`;

const fmtDate = (d: string | null) =>
  d
    ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date TBD';

const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
  x: '𝕏',
  twitter: '𝕏',
  facebook: '📘',
};

// Resolve the [start, end] window for a period. null bounds mean "unbounded".
function rangeFor(period: Period, custom: { from: string; to: string }) {
  const now = new Date();
  if (period === 'all') return { start: null as Date | null, end: null as Date | null };
  if (period === 'custom') {
    return {
      start: custom.from ? new Date(custom.from + 'T00:00:00') : null,
      end: custom.to ? new Date(custom.to + 'T23:59:59') : null,
    };
  }
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start = new Date(now);
  if (period === 'week') {
    const dow = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - dow);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'quarter') {
    start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  } else if (period === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function PerformancePanel({
  deals,
  accounts,
}: {
  deals: PortalDeal[];
  accounts: Account[];
}) {
  const [period, setPeriod] = useState<Period>('year');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [open, setOpen] = useState<CardKey | null>(null);

  const { start, end } = useMemo(() => rangeFor(period, custom), [period, custom]);

  // Deals whose booking date falls inside the window. Undated deals only count
  // toward all-time so they never silently vanish or double-count.
  const inWindow = useMemo(() => {
    return deals.filter((d) => {
      if (!d.booking_date) return start === null && end === null;
      const t = new Date(d.booking_date + 'T00:00:00').getTime();
      if (start && t < start.getTime()) return false;
      if (end && t > end.getTime()) return false;
      return true;
    });
  }, [deals, start, end]);

  const paidDeals = inWindow.filter((d) => d.status === 'completed');
  const owedDeals = inWindow.filter((d) => d.status !== 'completed' && d.invoice_number);

  const billed = paidDeals.reduce((s, d) => s + (Number(d.gross) || 0), 0);
  const owed = owedDeals.reduce((s, d) => s + (Number(d.gross) || 0), 0);
  const total = inWindow.reduce((s, d) => s + (Number(d.gross) || 0), 0);
  const totalReach = accounts.reduce((s, a) => s + (Number(a.followers) || 0), 0);

  const paidPct = total > 0 ? (billed / total) * 100 : 0;

  const cards: {
    key: CardKey;
    label: string;
    value: string;
    accent?: 'green' | 'tulip';
    note?: string;
  }[] = [
    { key: 'reach', label: 'Total reach', value: totalReach > 0 ? fmtCount(totalReach) : '—', note: 'current' },
    { key: 'paid', label: 'Paid to you', value: usd(billed), accent: 'green' },
    { key: 'owed', label: 'On the way', value: usd(owed), accent: 'tulip' },
    { key: 'total', label: 'Total booked', value: usd(total) },
  ];

  const toggle = (k: CardKey) => setOpen((cur) => (cur === k ? null : k));

  return (
    <div>
      {/* Period selector */}
      <div className="flex flex-wrap justify-center gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={
              'rounded-full border px-3.5 py-1.5 text-xs transition-colors ' +
              (period === p.key
                ? 'border-ink bg-ink text-ivory'
                : 'border-line text-stone hover:border-ink hover:text-ink')
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="mx-auto mt-4 flex max-w-md flex-wrap items-end justify-center gap-3">
          <label className="text-left">
            <span className="mb-1 block text-xs text-stone">From</span>
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </label>
          <label className="text-left">
            <span className="mb-1 block text-xs text-stone">To</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink"
            />
          </label>
        </div>
      )}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const color =
            c.accent === 'green' ? 'text-[#5B8C5A]' : c.accent === 'tulip' ? 'text-tulip' : 'text-ink';
          const active = open === c.key;
          return (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              className={
                'rounded-2xl border bg-white p-5 text-center transition-all ' +
                (active
                  ? 'border-ink shadow-sm'
                  : 'border-line hover:border-ink/40 hover:shadow-sm')
              }
            >
              <div className="flex items-center justify-center gap-1 text-xs uppercase tracking-wider text-stone">
                {c.label}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={'transition-transform ' + (active ? 'rotate-180' : '')}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
              <div className={`mt-1 font-display text-2xl sm:text-3xl ${color}`}>{c.value}</div>
              {c.note && <div className="mt-0.5 text-[0.65rem] text-stone">{c.note}</div>}
            </button>
          );
        })}
      </div>

      {/* Paid vs on-the-way bar */}
      {total > 0 && (
        <div className="mt-4">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-line">
            <div className="bg-[#5B8C5A]" style={{ width: `${paidPct}%` }} />
            <div className="bg-tulip" style={{ width: `${100 - paidPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-stone">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#5B8C5A]" />
              Paid {usd(billed)}
            </span>
            <span>
              On the way {usd(owed)}
              <span className="ml-1 inline-block h-2 w-2 rounded-full bg-tulip" />
            </span>
          </div>
        </div>
      )}

      {/* Detail panel */}
      {open && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-white">
          {open === 'reach' ? (
            <Detail title="Where your reach comes from" empty="No linked accounts yet.">
              {accounts.length > 0 &&
                accounts.map((a, i) => (
                  <Row
                    key={i}
                    left={`${PLATFORM_EMOJI[a.platform] ?? '🔗'} ${a.handle ?? a.platform}`}
                    right={a.followers != null ? `${fmtCount(Number(a.followers))} followers` : '—'}
                  />
                ))}
            </Detail>
          ) : (
            <Detail
              title={
                open === 'paid'
                  ? 'Deals paid out'
                  : open === 'owed'
                    ? 'Invoiced, awaiting payment'
                    : 'All deals booked'
              }
              empty={
                open === 'paid'
                  ? 'No payouts in this period yet.'
                  : open === 'owed'
                    ? 'Nothing awaiting payment in this period.'
                    : 'No deals booked in this period.'
              }
            >
              {(open === 'paid' ? paidDeals : open === 'owed' ? owedDeals : inWindow).map((d) => (
                <Row
                  key={d.id}
                  left={d.company_name}
                  sub={fmtDate(d.booking_date)}
                  right={d.gross != null ? usd(Number(d.gross)) : '—'}
                />
              ))}
            </Detail>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows;
  return (
    <div>
      <div className="border-b border-line px-5 py-3 text-sm font-medium text-ink">{title}</div>
      {isEmpty ? (
        <p className="px-5 py-6 text-center text-sm text-stone">{empty}</p>
      ) : (
        <div className="divide-y divide-line">{rows}</div>
      )}
    </div>
  );
}

function Row({
  left,
  sub,
  right,
}: {
  left: string;
  sub?: string;
  right: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">{left}</p>
        {sub && <p className="text-xs text-stone">{sub}</p>}
      </div>
      <span className="shrink-0 font-display text-base">{right}</span>
    </div>
  );
}
