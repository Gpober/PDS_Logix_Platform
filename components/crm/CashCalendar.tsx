'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CashEvent } from '@/lib/crm/cashCalendar';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const IN = '#5B8C5A'; // money in (green)
const OUT = '#C64B5A'; // money out (tulip red)

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Mode = 'ar' | 'ap' | 'net';

export function CashCalendar() {
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [mode, setMode] = useState<Mode>('net');
  const [events, setEvents] = useState<CashEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const monthStart = useMemo(() => new Date(view.getFullYear(), view.getMonth(), 1), [view]);
  const monthEnd = useMemo(() => new Date(view.getFullYear(), view.getMonth() + 1, 0), [view]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/cash-calendar?from=${ymd(monthStart)}&to=${ymd(monthEnd)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body?.error === 'not_configured'
            ? 'The I AM CFO connection isn’t configured yet.'
            : body?.error || 'Couldn’t load cash events.',
        );
        setEvents([]);
        return;
      }
      const data = (await res.json()) as { events: CashEvent[] };
      setEvents(data.events ?? []);
    } catch {
      setError('Couldn’t reach the cash calendar.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [monthStart, monthEnd]);

  useEffect(() => {
    load();
  }, [load]);

  // Events for the visible month, honoring the AR/AP/Net toggle.
  const monthEvents = useMemo(() => {
    const inMonth = (e: CashEvent) => e.date >= ymd(monthStart) && e.date <= ymd(monthEnd);
    return events.filter((e) => inMonth(e) && (mode === 'net' || e.source === mode));
  }, [events, mode, monthStart, monthEnd]);

  const byDate = useMemo(() => {
    const map = new Map<string, CashEvent[]>();
    for (const e of monthEvents) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [monthEvents]);

  // Summary: AR received vs AR due, AP out, and net expected cash.
  const summary = useMemo(() => {
    let arPaid = 0, arDue = 0, apPaid = 0, apDue = 0;
    for (const e of monthEvents) {
      if (e.source === 'ar') e.status === 'paid' ? (arPaid += e.amount) : (arDue += e.amount);
      else e.status === 'paid' ? (apPaid += e.amount) : (apDue += e.amount);
    }
    return { arPaid, arDue, apPaid, apDue, net: arPaid + arDue - (apPaid + apDue) };
  }, [monthEvents]);

  const calendarCells = useMemo(() => {
    const cells: (Date | null)[] = [];
    for (let i = 0; i < monthStart.getDay(); i++) cells.push(null);
    for (let d = 1; d <= monthEnd.getDate(); d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view, monthStart, monthEnd]);

  const dayTotals = (list: CashEvent[]) => {
    let inflow = 0, outflow = 0;
    for (const e of list) e.type === 'inflow' ? (inflow += e.amount) : (outflow += e.amount);
    return { inflow, outflow };
  };

  const step = (delta: number) => setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="rounded-full border border-line px-3 py-1 text-sm text-stone hover:border-ink">
            ‹
          </button>
          <span className="min-w-44 text-center font-display text-xl">
            {MONTHS[view.getMonth()]} {view.getFullYear()}
          </span>
          <button onClick={() => step(1)} className="rounded-full border border-line px-3 py-1 text-sm text-stone hover:border-ink">
            ›
          </button>
          <button
            onClick={() => setView(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="ml-1 rounded-full border border-line px-3 py-1 text-xs text-stone hover:border-ink"
          >
            Today
          </button>
        </div>
        <div className="flex overflow-hidden rounded-full border border-line">
          {([['ar', 'Money in'], ['ap', 'Money out'], ['net', 'Net']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={'px-3 py-1 text-xs transition-colors ' + (mode === m ? 'bg-ink text-ivory' : 'text-stone hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Received (in)" value={usd(summary.arPaid)} color={IN} />
        <Tile label="Due in (open)" value={usd(summary.arDue)} color={IN} faded />
        <Tile label="Out to talent" value={usd(summary.apPaid + summary.apDue)} color={OUT} />
        <Tile label="Net expected" value={usd(summary.net)} color={summary.net >= 0 ? IN : OUT} />
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-tulip/40 bg-blush/50 px-4 py-2.5 text-center text-sm text-tulip-dark">
          {error}
        </p>
      )}

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="grid grid-cols-7 border-b border-line text-center text-xs uppercase tracking-wider text-stone">
          {DAYS.map((d) => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarCells.map((date, i) => {
            if (!date) return <div key={i} className="min-h-24 border-b border-r border-line bg-ivory/40" />;
            const key = ymd(date);
            const list = byDate.get(key) ?? [];
            const { inflow, outflow } = dayTotals(list);
            const isToday = key === ymd(today);
            return (
              <button
                key={i}
                onClick={() => list.length && setSelected(key)}
                className={
                  'min-h-24 border-b border-r border-line p-2 text-left align-top transition-colors ' +
                  (list.length ? 'hover:bg-blush/30' : 'cursor-default') +
                  (isToday ? ' bg-blush/20' : '')
                }
              >
                <div className={'text-xs ' + (isToday ? 'font-semibold text-ink' : 'text-stone')}>
                  {date.getDate()}
                </div>
                <div className="mt-1 space-y-0.5">
                  {inflow > 0 && (mode === 'ar' || mode === 'net') && (
                    <div className="truncate text-xs font-medium" style={{ color: IN }}>
                      +{usd(inflow)}
                    </div>
                  )}
                  {outflow > 0 && (mode === 'ap' || mode === 'net') && (
                    <div className="truncate text-xs font-medium" style={{ color: OUT }}>
                      −{usd(outflow)}
                    </div>
                  )}
                  {list.length > 0 && (
                    <div className="text-[10px] text-stone">
                      {list.length} item{list.length === 1 ? '' : 's'}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {loading && <p className="mt-3 text-center text-xs text-stone">Loading…</p>}

      {selected && (
        <DayModal date={selected} events={byDate.get(selected) ?? []} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function Tile({ label, value, color, faded }: { label: string; value: string; color: string; faded?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 text-center">
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className="mt-1 font-display text-xl" style={{ color, opacity: faded ? 0.7 : 1 }}>
        {value}
      </div>
    </div>
  );
}

function DayModal({ date, events, onClose }: { date: string; events: CashEvent[]; onClose: () => void }) {
  const long = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const inflows = events.filter((e) => e.type === 'inflow');
  const outflows = events.filter((e) => e.type === 'outflow');
  const sum = (l: CashEvent[]) => l.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">{long}</h3>
          <button onClick={onClose} className="text-stone hover:text-ink">✕</button>
        </div>

        <div className="mb-4 flex gap-3 text-sm">
          <span style={{ color: IN }}>In {usd(sum(inflows))}</span>
          <span style={{ color: OUT }}>Out {usd(sum(outflows))}</span>
          <span className="ml-auto text-stone">Net {usd(sum(inflows) - sum(outflows))}</span>
        </div>

        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-ink">{e.name}</span>
                <span className="shrink-0 font-medium" style={{ color: e.type === 'inflow' ? IN : OUT }}>
                  {e.type === 'inflow' ? '+' : '−'}{usd(e.amount)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-stone">
                <span className="rounded-full bg-blush/60 px-2 py-0.5 uppercase tracking-wide">
                  {e.source} · {e.status}
                </span>
                {e.reference && <span>Ref {e.reference}</span>}
                {e.status === 'due' && e.dueDate && <span>Due {e.dueDate}</span>}
              </div>
              {e.linkedDocuments && e.linkedDocuments.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-stone">
                  {e.linkedDocuments.map((d, j) => (
                    <li key={j} className="flex justify-between gap-2">
                      <span className="truncate">#{d.docNumber}{d.customerMemo ? ` · ${d.customerMemo}` : ''}</span>
                      <span className="shrink-0">{usd(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
