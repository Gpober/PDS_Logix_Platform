// Live Connecteam vs. the synced copy, entry by entry.
//
// The reason production drifted for so long is that nothing ever compared the
// two. The sync inserted and skipped, every report read the copy, and a missing
// unit looked exactly like a slow day. This is the check that makes a claim of
// congruency falsifiable: it walks both sides over the same window and names
// every row that differs.
//
// Three ways they can disagree, and each has a different cause:
//   missingInStored  — Connecteam has it, the database does not. A sync that
//                      never ran, ran outside its window, or covers a form that
//                      is not on the roster. This is the undercount.
//   extraInStored    — the database has it, Connecteam does not. A submission
//                      deleted or voided over there; the old insert-only sync
//                      had no way to remove it. This is the overcount.
//   mismatched       — both hold the row, but a field differs. A submission
//                      edited after it was first synced; again, insert-only
//                      never revisited it.

import { isDay, type ProductionRow } from '@/lib/connecteam/client';
import { readProduction, type ProductionRead } from './source';

export interface FieldDiff {
  field: string;
  live: string | null;
  stored: string | null;
}

export interface MismatchedEntry {
  key: string;
  external_id: string | null;
  location: string;
  submitted_at: string | null;
  diffs: FieldDiff[];
}

export interface EntryRef {
  key: string;
  external_id: string | null;
  form_id: string | null;
  location: string;
  staff_name: string | null;
  service_type: string | null;
  submitted_at: string | null;
}

export interface ReconcileResult {
  window: { from: string; to: string };
  asOf: string;
  /** True only when the live read completed AND every row lines up. Anything
   *  else is "not proven", never "fine". */
  congruent: boolean;
  liveComplete: boolean;
  liveTotal: number;
  storedTotal: number;
  drift: number;
  missingInStored: EntryRef[];
  extraInStored: EntryRef[];
  mismatched: MismatchedEntry[];
  byLocation: {
    location: string;
    live: number;
    stored: number;
    missing: number;
    extra: number;
    mismatched: number;
  }[];
  notes: string[];
  liveRead: Omit<ProductionRead, 'rows'>;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

/** Rows are identified the way Connecteam guarantees uniqueness: the entry
 *  number within its form. Rows predating form_id (xlsx imports) fall back to
 *  location, which is the best identity they carry. */
function keyOf(r: ProductionRow): string {
  if (!r.external_id) return `anon:${r.form_id ?? r.location}:${r.submitted_at ?? ''}:${r.vin_last6 ?? ''}`;
  return r.form_id ? `form:${r.form_id}:${r.external_id}` : `loc:${r.location}:${r.external_id}`;
}

/** The secondary identity, so a stored row with no form_id can still be matched
 *  to the live row it came from. */
function altKeyOf(r: ProductionRow): string | null {
  return r.external_id ? `loc:${r.location}:${r.external_id}` : null;
}

const COMPARED: { field: keyof ProductionRow; label: string }[] = [
  { field: 'location', label: 'location' },
  { field: 'staff_name', label: 'staff_name' },
  { field: 'service_type', label: 'service_type' },
];

function refOf(r: ProductionRow, key: string): EntryRef {
  return {
    key,
    external_id: r.external_id,
    form_id: r.form_id ?? null,
    location: r.location,
    staff_name: r.staff_name,
    service_type: r.service_type,
    submitted_at: r.submitted_at,
  };
}

export async function reconcileProduction(opts: {
  from: string;
  to: string;
  location?: string;
  budgetMs?: number;
  /** Cap on how many individual rows are listed per bucket; the counts are
   *  always exact regardless. */
  sampleLimit?: number;
}): Promise<ReconcileResult> {
  const { from, to, location, budgetMs = 25_000, sampleLimit = 50 } = opts;
  const asOf = new Date().toISOString();
  const notes: string[] = [];

  if (!isDay(from) || !isDay(to) || from > to) {
    throw new Error('from/to must be YYYY-MM-DD with from <= to');
  }

  // 'live' so an incomplete live read is reported as incomplete rather than
  // quietly replaced by the very copy we are auditing.
  const live = await readProduction({ from, to, location, budgetMs, prefer: 'live' });
  const stored = await readProduction({ from, to, location, prefer: 'stored' });

  const { rows: liveRows, ...liveMeta } = live;
  const storedRows = stored.rows;

  if (!live.live || live.degraded) {
    notes.push(
      live.reason
        ? `Live read did not complete (${live.reason}) — differences below are not conclusive.`
        : 'Live read did not complete — differences below are not conclusive.',
    );
  }
  if (stored.reason) notes.push(`Stored read: ${stored.reason}`);

  // Index the live side by both identities.
  const liveByKey = new Map<string, ProductionRow>();
  const liveByAlt = new Map<string, ProductionRow>();
  for (const r of liveRows) {
    liveByKey.set(keyOf(r), r);
    const alt = altKeyOf(r);
    if (alt) liveByAlt.set(alt, r);
  }

  const matchedLive = new Set<string>();
  const extraInStored: EntryRef[] = [];
  const mismatched: MismatchedEntry[] = [];
  let extraCount = 0;
  let mismatchCount = 0;

  for (const s of storedRows) {
    const k = keyOf(s);
    let l = liveByKey.get(k);
    if (!l) {
      const alt = altKeyOf(s);
      if (alt) l = liveByAlt.get(alt);
    }
    if (!l) {
      extraCount += 1;
      if (extraInStored.length < sampleLimit) extraInStored.push(refOf(s, k));
      continue;
    }
    matchedLive.add(keyOf(l));

    const diffs: FieldDiff[] = [];
    for (const { field, label } of COMPARED) {
      const lv = (l[field] ?? null) as string | null;
      const sv = (s[field] ?? null) as string | null;
      if ((lv ?? '') !== (sv ?? '')) diffs.push({ field: label, live: lv, stored: sv });
    }
    const ld = day(l.submitted_at);
    const sd = day(s.submitted_at);
    if (ld !== sd) diffs.push({ field: 'submitted_on', live: ld, stored: sd });

    if (diffs.length) {
      mismatchCount += 1;
      if (mismatched.length < sampleLimit) {
        mismatched.push({
          key: k,
          external_id: s.external_id,
          location: s.location,
          submitted_at: s.submitted_at,
          diffs,
        });
      }
    }
  }

  const missingInStored: EntryRef[] = [];
  let missingCount = 0;
  for (const r of liveRows) {
    const k = keyOf(r);
    if (matchedLive.has(k)) continue;
    missingCount += 1;
    if (missingInStored.length < sampleLimit) missingInStored.push(refOf(r, k));
  }

  // Per-location rollup, computed over all rows rather than the samples.
  const locs = new Map<
    string,
    { location: string; live: number; stored: number; missing: number; extra: number; mismatched: number }
  >();
  const bucket = (name: string) => {
    let b = locs.get(name);
    if (!b) {
      b = { location: name, live: 0, stored: 0, missing: 0, extra: 0, mismatched: 0 };
      locs.set(name, b);
    }
    return b;
  };
  for (const r of liveRows) bucket(r.location).live += 1;
  for (const r of storedRows) bucket(r.location).stored += 1;
  for (const r of missingInStored) bucket(r.location).missing += 1;
  for (const r of extraInStored) bucket(r.location).extra += 1;
  for (const m of mismatched) bucket(m.location).mismatched += 1;

  if (missingCount > missingInStored.length || extraCount > extraInStored.length) {
    notes.push(
      `Per-location missing/extra counts are sampled (first ${sampleLimit} of each); the totals above are exact.`,
    );
  }

  const congruent =
    live.live && !live.degraded && missingCount === 0 && extraCount === 0 && mismatchCount === 0;

  return {
    window: { from, to },
    asOf,
    congruent,
    liveComplete: live.live && !live.degraded,
    liveTotal: liveRows.length,
    storedTotal: storedRows.length,
    drift: liveRows.length - storedRows.length,
    missingInStored,
    extraInStored,
    mismatched,
    byLocation: [...locs.values()].sort((a, b) => b.live - a.live || a.location.localeCompare(b.location)),
    notes,
    liveRead: liveMeta,
  };
}
