// The one place production is read from.
//
// Order of truth:
//   1. Connecteam, live, for any window inside the recent cutoff. Payroll and
//      daily reports are always read from the system of record itself, so a
//      number in a report is a number in Connecteam.
//   2. The synced copy in production_entries, for older windows — by then the
//      sync has had many passes at the range — and whenever a live read is
//      unavailable, incomplete, or over budget.
//
// Every result says which source served it and whether it is degraded. A caller
// that renders a number without that label is the bug this replaces: reports
// used to read the copy unconditionally, so drift was invisible.

import { createServiceSupabase, serviceConfigured } from '@/lib/supabase/service';
import { connecteamConfigured, isDay, type ProductionRow } from '@/lib/connecteam/client';
import { fetchLiveProduction, type FormReadResult } from '@/lib/connecteam/live';

export type ProductionSourceName = 'connecteam' | 'production_entries';

export interface ProductionRead {
  rows: ProductionRow[];
  source: ProductionSourceName;
  /** True when the rows came straight from Connecteam. */
  live: boolean;
  /** True when a live read was wanted but the synced copy answered instead. */
  degraded: boolean;
  /** Why the fallback happened, or why live was not attempted. */
  reason?: string;
  /** Null on either side means unbounded — 'everything on record', which only
   *  the stored copy holds. */
  window: { from: string | null; to: string | null };
  asOf: string;
  forms?: FormReadResult[];
  /** Human-readable provenance, safe to show in a report footer. */
  label: string;
}

/** How far back a live read is attempted. Beyond this the backwards page-walk
 *  through Connecteam's newest-first API costs more than the function budget
 *  allows, and the synced copy has long since converged. */
const DEFAULT_LIVE_WINDOW_DAYS = 90;

export function liveWindowDays(): number {
  const raw = Number(process.env.PRODUCTION_LIVE_WINDOW_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : DEFAULT_LIVE_WINDOW_DAYS;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** A window is live-eligible when its OLDEST day is inside the cutoff — a range
 *  that reaches further back than that is served whole from the copy rather than
 *  stitched from two sources, so a total is never half live and half stored. */
export function liveEligible(from: string, to: string, now = new Date()): boolean {
  const cutoff = ymd(new Date(now.getTime() - liveWindowDays() * 86400_000));
  return from >= cutoff && to >= from;
}

// ---- short-lived cache ------------------------------------------------------
// One assistant turn or one MCP conversation can ask several production
// questions over the same window. Without this each would re-walk Connecteam.
// Deliberately short: a cached read must never outlive the freshness it claims.

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; read: ProductionRead }>();

function cacheKey(from: string, to: string, location?: string) {
  return `${from}|${to}|${location ?? ''}`;
}

function cacheGet(key: string): ProductionRead | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.read;
}

function cacheSet(key: string, read: ProductionRead) {
  // Only a complete live read is worth holding — a degraded one should be
  // retried on the next request, not pinned for a minute.
  if (!read.live) return;
  if (cache.size > 64) cache.clear();
  cache.set(key, { at: Date.now(), read });
}

// ---- the stored copy --------------------------------------------------------

async function readStored(opts: {
  from?: string;
  to?: string;
  location?: string;
}): Promise<{ rows: ProductionRow[]; error?: string }> {
  if (!serviceConfigured()) return { rows: [], error: 'SUPABASE_SERVICE_ROLE_KEY not set' };
  const supabase = createServiceSupabase();
  // `to` is inclusive of the whole day.
  const upper = opts.to
    ? new Date(Date.parse(`${opts.to}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10)
    : null;

  const rows: ProductionRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = supabase
      .from('production_entries')
      .select(
        'form_id, external_id, location, staff_name, submitted_at, service_type, vehicle_year, vin_last6, model_type, capture, work_order_number, note, status, source',
      )
      // `id` is the tiebreaker: submitted_at alone is not a total order, and a
      // non-total sort makes paging skip and repeat rows.
      .order('submitted_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (opts.from) q = q.gte('submitted_at', opts.from);
    if (upper) q = q.lt('submitted_at', upper);
    if (opts.location) q = q.ilike('location', `%${opts.location}%`);
    const { data, error } = await q;
    if (error) return { rows, error: error.message };
    const batch = (data ?? []) as ProductionRow[];
    rows.push(...batch);
    if (batch.length < 1000) break;
    if (offset > 100_000) break; // pathological range; the count is still usable
  }
  return { rows };
}

// ---- the read ---------------------------------------------------------------

export async function readProduction(opts: {
  /** Omit either side for "everything on record" — an unbounded window is
   *  served from the stored copy, which is the only side that holds full
   *  history. */
  from?: string;
  to?: string;
  location?: string;
  /** Wall-clock ceiling for the live attempt. */
  budgetMs?: number;
  /** Force one source. 'stored' skips the live attempt entirely; 'live' skips
   *  the fallback so a caller can see the raw live result (used by reconcile). */
  prefer?: 'auto' | 'stored' | 'live';
}): Promise<ProductionRead> {
  const { from, to, location, budgetMs = 20_000, prefer = 'auto' } = opts;
  const window = { from: from ?? null, to: to ?? null };
  const asOf = new Date().toISOString();

  const bounded = Boolean(from && to);
  if ((from && !isDay(from)) || (to && !isDay(to)) || (bounded && from! > to!)) {
    return {
      rows: [],
      source: 'production_entries',
      live: false,
      degraded: true,
      reason: 'from/to must be YYYY-MM-DD with from <= to',
      window,
      asOf,
      label: 'Invalid date range',
    };
  }

  const key = cacheKey(from ?? '', to ?? '', location);
  if (prefer !== 'stored') {
    const hit = cacheGet(key);
    if (hit) return { ...hit, asOf };
  }

  // A live read needs both ends: Connecteam is walked backwards from newest, so
  // an open-ended window has no point to stop at.
  const wantLive =
    bounded && (prefer === 'live' || (prefer === 'auto' && liveEligible(from!, to!)));
  let reason: string | undefined;

  if (prefer === 'auto' && !wantLive) {
    reason = bounded
      ? `window starts more than ${liveWindowDays()} days back — served from the synced copy`
      : 'no date range given — "everything on record" is served from the synced copy';
  } else if (wantLive && !connecteamConfigured()) {
    reason = 'CONNECTEAM_API_KEY not set';
  } else if (wantLive) {
    const live = await fetchLiveProduction({ from: from!, to: to!, location, budgetMs });
    if (live.complete) {
      const read: ProductionRead = {
        rows: live.rows,
        source: 'connecteam',
        live: true,
        degraded: false,
        window,
        asOf,
        forms: live.forms,
        label: `Live from Connecteam · ${live.forms.length} form${live.forms.length === 1 ? '' : 's'} · read in ${(live.fetchedMs / 1000).toFixed(1)}s`,
      };
      cacheSet(key, read);
      return read;
    }
    reason = live.errors.length
      ? `live read incomplete: ${live.errors.slice(0, 3).join('; ')}`
      : 'live read incomplete';
    if (prefer === 'live') {
      // The caller asked for the raw live result and gets it, incompleteness
      // included, rather than a silent substitution.
      return {
        rows: live.rows,
        source: 'connecteam',
        live: true,
        degraded: true,
        reason,
        window,
        asOf,
        forms: live.forms,
        label: `Live from Connecteam (INCOMPLETE — ${reason})`,
      };
    }
  }

  const stored = await readStored({ from, to, location });
  const storedReason = [reason, stored.error && `stored read: ${stored.error}`]
    .filter(Boolean)
    .join(' · ');
  return {
    rows: stored.rows,
    source: 'production_entries',
    live: false,
    degraded: wantLive || Boolean(stored.error),
    reason: storedReason || undefined,
    window,
    asOf,
    label: wantLive
      ? `Synced copy (Connecteam unavailable — ${reason ?? 'unknown'})`
      : bounded
        ? 'Synced copy of Connecteam (nightly) — window predates the live read'
        : 'Synced copy of Connecteam (nightly) — all history',
  };
}

// ---- aggregation ------------------------------------------------------------
// Shaped exactly like get_production_summary's jsonb so existing callers are
// source-agnostic.

export interface ProductionSummaryShape {
  total_units: number;
  date_from: string | null;
  date_to: string | null;
  locations: { location: string; units: number }[];
  by_service: { service_type: string; units: number }[];
  by_staff: { staff: string; units: number }[];
  by_month: { month: string; units: number }[];
  by_day: { day: string; units: number }[];
}

function tally<T>(rows: ProductionRow[], key: (r: ProductionRow) => string | null, label: string) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k == null) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, units]) => ({ [label]: k, units })) as T[];
}

export function summarize(rows: ProductionRow[]): ProductionSummaryShape {
  const days = rows.map((r) => r.submitted_at?.slice(0, 10)).filter(Boolean) as string[];
  days.sort();
  const desc = <T extends { units: number }>(a: T[]) => a.sort((x, y) => y.units - x.units);
  const byDay = tally<{ day: string; units: number }>(rows, (r) => r.submitted_at?.slice(0, 10) ?? null, 'day');
  const byMonth = tally<{ month: string; units: number }>(rows, (r) => r.submitted_at?.slice(0, 7) ?? null, 'month');
  return {
    total_units: rows.length,
    date_from: days[0] ?? null,
    date_to: days[days.length - 1] ?? null,
    locations: desc(tally<{ location: string; units: number }>(rows, (r) => r.location || null, 'location')),
    by_service: desc(tally<{ service_type: string; units: number }>(rows, (r) => r.service_type, 'service_type')),
    by_staff: desc(tally<{ staff: string; units: number }>(rows, (r) => r.staff_name, 'staff')),
    by_month: byMonth.sort((a, b) => a.month.localeCompare(b.month)),
    by_day: byDay.sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export async function productionSummaryFromSource(opts: {
  from?: string;
  to?: string;
  location?: string;
  budgetMs?: number;
  prefer?: 'auto' | 'stored' | 'live';
}): Promise<{ summary: ProductionSummaryShape; read: Omit<ProductionRead, 'rows'> }> {
  const read = await readProduction(opts);
  const { rows, ...meta } = read;
  return { summary: summarize(rows), read: meta };
}

/** One worker's units for a window, from the same source as every other
 *  production number. Scoping is by name, exactly as the get_worker_production
 *  RPC it replaces — the caller decides whose name it may pass. */
export async function workerProductionFromSource(opts: {
  staffName: string;
  from: string;
  to: string;
}): Promise<{ summary: ProductionSummaryShape; read: Omit<ProductionRead, 'rows'> }> {
  const read = await readProduction({ from: opts.from, to: opts.to });
  const { rows, ...meta } = read;
  const needle = opts.staffName.trim().toLowerCase();
  const mine = rows.filter((r) => (r.staff_name ?? '').trim().toLowerCase() === needle);
  return { summary: summarize(mine), read: meta };
}
