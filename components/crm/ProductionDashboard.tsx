'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// ---- shapes (mirror /api/production/summary) --------------------------------
type Named = { units: number } & Record<string, string | number>;
interface Summary {
  total_units: number;
  date_from: string | null;
  date_to: string | null;
  locations: Named[];
  by_service: Named[];
  by_staff: Named[];
  by_month: Named[];
  by_day: Named[];
}
interface Goal { target: number; actual: number; location: string | null; period: string }
interface EntryRow {
  external_id: string | null; location: string; staff_name: string | null; submitted_at: string | null;
  service_type: string | null; vehicle_year: number | null; vin_last6: string | null; model_type: string | null; capture: string | null;
}

const nf = (n: number) => n.toLocaleString('en-US');
const TONE = { ink: '#F2F5F8', cyan: '#16B4E8', good: '#4ADE80', warn: '#FBBF24', bad: '#F87171' };

// ---- date helpers -----------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function presetRange(preset: string, today: Date): { from?: string; to?: string; month?: string } {
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const monthStr = `${y}-${pad(m + 1)}`;
  if (preset === 'month') return { from: `${y}-${pad(m + 1)}-01`, to: iso(today), month: monthStr };
  if (preset === 'last') { const lm = new Date(Date.UTC(y, m - 1, 1)); const end = new Date(Date.UTC(y, m, 0)); return { from: iso(lm), to: iso(end), month: `${lm.getUTCFullYear()}-${pad(lm.getUTCMonth() + 1)}` }; }
  if (preset === 'quarter') { const qs = Math.floor(m / 3) * 3; return { from: `${y}-${pad(qs + 1)}-01`, to: iso(today), month: monthStr }; }
  if (preset === 'ytd') return { from: `${y}-01-01`, to: iso(today), month: monthStr };
  return { month: monthStr }; // 'all'
}

// ---- KPI tile (glow + display number + accent underline) --------------------
function Kpi({ label, value, tone = TONE.ink, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="group relative flex flex-col items-center overflow-hidden rounded-[20px] border border-line bg-gradient-to-b from-white to-blush/50 px-5 py-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.3),0_12px_30px_rgba(22,180,232,0.06)] transition duration-300 hover:-translate-y-0.5">
      <span className="pointer-events-none absolute -top-10 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-30" style={{ background: tone }} />
      <div className="relative text-[10px] font-semibold uppercase tracking-[0.18em] text-stone">{label}</div>
      <div className="relative mt-3 font-display text-[2rem] leading-none tabular-nums" style={{ color: tone }}>{value}</div>
      <span className="relative mt-3 h-[3px] w-7 rounded-full" style={{ background: tone, opacity: 0.6 }} />
      {sub != null && <div className="relative mt-2.5 text-xs text-stone">{sub}</div>}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap overflow-hidden rounded-full border border-line">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={'px-3 py-1 text-xs transition-colors ' + (value === o.v ? 'bg-tulip text-ivory' : 'text-stone hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Ranked horizontal bars (clickable to drill).
function RankBars({ title, rows, keyName, tone, onPick, active, limit = 12 }: { title: string; rows: Named[]; keyName: string; tone: string; onPick?: (v: string) => void; active?: string | null; limit?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="eyebrow">Breakdown</p>
      <h3 className="mt-1 mb-3 font-display text-lg">{title}</h3>
      <div className="space-y-2">
        {rows.slice(0, limit).map((r, i) => {
          const key = String(r[keyName] ?? '—');
          const on = active === key;
          return (
            <button key={i} onClick={() => onPick?.(key)} disabled={!onPick}
              className={'block w-full rounded-lg px-1.5 py-1 text-left transition-colors ' + (onPick ? 'hover:bg-blush/60 ' : '') + (on ? 'bg-blush' : '')}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink">{key}</span>
                <span className="shrink-0 tabular-nums text-stone">{nf(r.units)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-blush">
                <div className="h-full rounded-full" style={{ width: `${(r.units / max) * 100}%`, background: tone, opacity: on ? 1 : 0.85 }} />
              </div>
            </button>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-stone">No data.</p>}
      </div>
    </div>
  );
}

// Vertical monthly bars (clickable → filter to that month).
function MonthBars({ rows, activeMonth, onPick }: { rows: Named[]; activeMonth: string | null; onPick: (m: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.units));
  const fmt = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="eyebrow">Trend</p>
      <h3 className="mt-1 mb-3 font-display text-lg">Units by month</h3>
      <div className="flex h-44 items-end gap-2">
        {rows.map((r) => {
          const month = String(r.month);
          const on = activeMonth === month;
          return (
            <button key={month} onClick={() => onPick(month)} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-stone">{nf(r.units)}</span>
              <div className="flex h-32 w-full items-end">
                <div className="w-full rounded-t transition-all" style={{ height: `${(r.units / max) * 100}%`, background: TONE.cyan, opacity: on ? 1 : 0.55 }} title={`${month}: ${nf(r.units)}`} />
              </div>
              <span className={'text-[10px] ' + (on ? 'text-ink' : 'text-stone')}>{fmt(month)}</span>
            </button>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-stone">No data.</p>}
      </div>
    </div>
  );
}

// Goal card: progress + pace for the focus month.
function GoalCard({ goal, today, onSet }: { goal: Goal | null; today: Date; onSet: () => void }) {
  if (!goal) return null;
  const { target, actual, period } = goal;
  const label = new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
  // Pace: is this month a partial (current) month? expected-by-now vs actual.
  const isCurrent = period === `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}`;
  const daysIn = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const dayNow = isCurrent ? today.getUTCDate() : daysIn;
  const expected = target > 0 ? Math.round((target * dayNow) / daysIn) : 0;
  const onTrack = actual >= expected;
  const projected = isCurrent && dayNow > 0 ? Math.round((actual / dayNow) * daysIn) : actual;
  const barTone = target === 0 ? TONE.ink : pct >= 100 ? TONE.good : onTrack ? TONE.cyan : TONE.warn;

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between">
        <div><p className="eyebrow">Goal</p><h3 className="mt-1 font-display text-lg">{label} target</h3></div>
        <button onClick={onSet} className="rounded-full border border-line px-3 py-1 text-xs text-stone hover:border-tulip hover:text-tulip">
          {target > 0 ? 'Edit goal' : 'Set goal'}
        </button>
      </div>
      {target === 0 ? (
        <p className="mt-3 text-sm text-stone">No target set for this month. Set one to track pace to goal.</p>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between">
            <div className="font-display text-3xl tabular-nums" style={{ color: barTone }}>{nf(actual)}</div>
            <div className="text-sm text-stone">of {nf(target)} units · <span style={{ color: barTone }}>{pct}%</span></div>
          </div>
          <div className="mt-2 h-4 w-full overflow-hidden rounded-full bg-blush">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: barTone }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-stone">
            <span>{isCurrent ? `Pace: ${onTrack ? 'on track' : 'behind'} (expected ~${nf(expected)} by today)` : onTrack ? 'Goal met' : 'Missed target'}</span>
            {isCurrent && <span>Projected ~{nf(projected)} by month-end</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function ProductionDashboard({
  initialSummary, initialGoal, locations, todayIso,
}: { initialSummary: Summary; initialGoal: Goal | null; locations: string[]; todayIso: string }) {
  const today = useMemo(() => new Date(`${todayIso}T00:00:00Z`), [todayIso]);
  const [location, setLocation] = useState<string>('');       // '' = all
  const [preset, setPreset] = useState<string>('ytd');
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [goal, setGoal] = useState<Goal | null>(initialGoal);
  const [loading, setLoading] = useState(false);

  // drill state
  const [drillService, setDrillService] = useState<string | null>(null);
  const [drillStaff, setDrillStaff] = useState<string | null>(null);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [rows, setRows] = useState<EntryRow[] | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [q, setQ] = useState('');

  const range = useMemo(() => presetRange(preset, today), [preset, today]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (location) p.set('location', location);
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    if (range.month) p.set('month', range.month);
    try {
      const res = await fetch(`/api/production/summary?${p}`);
      const data = await res.json();
      if (data.summary) setSummary(data.summary);
      setGoal(data.goal ?? null);
    } finally { setLoading(false); }
  }, [location, range]);

  useEffect(() => { load(); }, [load]);

  // Detail: month clicks set an explicit from/to; else use the period range.
  const detailRange = useMemo(() => {
    if (drillMonth) { const [y, m] = drillMonth.split('-').map(Number); const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)); return { from: `${drillMonth}-01`, to: iso(end) }; }
    return { from: range.from, to: range.to };
  }, [drillMonth, range]);

  const loadRows = useCallback(async () => {
    const p = new URLSearchParams();
    if (location) p.set('location', location);
    if (detailRange.from) p.set('from', detailRange.from);
    if (detailRange.to) p.set('to', detailRange.to);
    if (drillService) p.set('service', drillService);
    if (drillStaff) p.set('staff', drillStaff);
    if (q.trim()) p.set('q', q.trim());
    p.set('limit', '100');
    const res = await fetch(`/api/production/entries?${p}`);
    const data = await res.json();
    setRows(data.rows ?? []); setRowCount(data.count ?? 0);
  }, [location, detailRange, drillService, drillStaff, q]);

  const hasDrill = drillService || drillStaff || drillMonth || q.trim();
  useEffect(() => { if (hasDrill) loadRows(); else { setRows(null); setRowCount(0); } }, [hasDrill, loadRows]);

  const days = Math.max(1, summary.by_day?.length ?? 1);
  const perDay = Math.round((summary.total_units ?? 0) / days);
  const drillChips = [
    drillMonth && { label: new Date(`${drillMonth}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }), clear: () => setDrillMonth(null) },
    drillService && { label: drillService, clear: () => setDrillService(null) },
    drillStaff && { label: drillStaff, clear: () => setDrillStaff(null) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Segmented value={location} onChange={setLocation}
          options={[{ v: '', label: 'All locations' }, ...locations.map((l) => ({ v: l, label: l }))]} />
        <Segmented value={preset} onChange={setPreset}
          options={[{ v: 'month', label: 'This month' }, { v: 'last', label: 'Last month' }, { v: 'quarter', label: 'Quarter' }, { v: 'ytd', label: 'YTD' }, { v: 'all', label: 'All' }]} />
        {loading && <span className="text-xs text-stone">Loading…</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Units" value={nf(summary.total_units ?? 0)} tone={TONE.cyan} sub={summary.date_from ? `${summary.date_from} → ${summary.date_to}` : undefined} />
        <Kpi label="Per day" value={nf(perDay)} tone={TONE.ink} sub={`over ${days} day${days === 1 ? '' : 's'}`} />
        <Kpi label="People" value={nf((summary.by_staff ?? []).length)} tone={TONE.ink} sub="producing" />
        <Kpi label="Service types" value={nf((summary.by_service ?? []).length)} tone={TONE.ink} sub={(summary.locations ?? []).length > 1 ? `${summary.locations.length} locations` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalCard goal={goal} today={today} onSet={() => { const el = document.getElementById('goal-form'); el?.scrollIntoView({ behavior: 'smooth' }); el?.classList.add('ring-2', 'ring-tulip'); setTimeout(() => el?.classList.remove('ring-2', 'ring-tulip'), 1600); }} />
        <MonthBars rows={summary.by_month ?? []} activeMonth={drillMonth} onPick={(m) => setDrillMonth((cur) => (cur === m ? null : m))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankBars title="By service type" rows={summary.by_service ?? []} keyName="service_type" tone={TONE.cyan} active={drillService} onPick={(v) => setDrillService((c) => (c === v ? null : v))} />
        <RankBars title="Top producers" rows={summary.by_staff ?? []} keyName="staff" tone={TONE.good} active={drillStaff} onPick={(v) => setDrillStaff((c) => (c === v ? null : v))} limit={15} />
      </div>

      {/* Detail (drill-down) */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Detail</p>
            <h3 className="mt-1 font-display text-lg">The units behind the numbers{rowCount ? ` · ${nf(rowCount)}` : ''}</h3>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search VIN / model / #"
            className="rounded-full border border-line bg-ivory px-4 py-1.5 text-sm text-ink outline-none focus:border-tulip" />
        </div>
        {drillChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {drillChips.map((c, i) => (
              <button key={i} onClick={c.clear} className="rounded-full border border-tulip/40 bg-blush/60 px-3 py-1 text-xs text-tulip hover:border-tulip">
                {c.label} ✕
              </button>
            ))}
          </div>
        )}
        {!hasDrill ? (
          <p className="mt-3 text-sm text-stone">Click a month, service type, or person above — or search — to see the individual units (who, when, VIN, model).</p>
        ) : rows == null ? (
          <p className="mt-3 text-sm text-stone">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm text-stone">No matching units.</p>
        ) : (
          <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-line bg-white text-xs uppercase tracking-wider text-stone">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Person</th>
                  <th className="px-3 py-2 text-left font-medium">Service</th>
                  <th className="px-3 py-2 text-left font-medium">Vehicle</th>
                  <th className="px-3 py-2 text-left font-medium">VIN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-line hover:bg-blush/30">
                    <td className="whitespace-nowrap px-3 py-2 text-stone">{r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                    <td className="px-3 py-2 text-ink">{r.staff_name ?? '—'}</td>
                    <td className="px-3 py-2 text-stone">{r.service_type ?? '—'}</td>
                    <td className="px-3 py-2 text-stone">{[r.vehicle_year, r.model_type].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-stone">{r.vin_last6 ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rowCount > rows.length && <p className="border-t border-line p-2 text-center text-xs text-stone">Showing {rows.length} of {nf(rowCount)} — narrow the filters or search to see more.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
