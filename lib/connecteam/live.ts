// A live read of production straight from Connecteam.
//
// This is the primary source for reports and MCP requests. It fetches every
// active form in parallel inside a wall-clock budget and returns rows in exactly
// the shape production_entries stores.
//
// `complete` is the load-bearing field. Connecteam's forms API is newest-first
// with no date filter, so a window is walked backwards page by page — and if the
// budget runs out mid-walk the result is a PARTIAL count that looks exactly like
// a smaller one. A caller must never render an incomplete live read as a number;
// it falls back to the synced copy instead. That distinction is the whole reason
// silent undercounts were possible before.

import {
  connecteamConfigured,
  getFormQuestions,
  listForms,
  getSubmissions,
  getUsersMap,
  normalizeSubmission,
  windowBounds,
  withinActivation,
  type ProductionForm,
  type ProductionRow,
} from './client';
import { formsCoveringRange, loadRoster } from './forms';

export interface FormReadResult {
  formId: string;
  formName: string | null;
  fetched: number;
  counted: number;
  /** Dropped because the form was not yet active on that submission's date. */
  beforeActivation: number;
  truncated: boolean;
  error?: string;
}

export interface LiveRead {
  rows: ProductionRow[];
  /** False if any active form errored or was truncated. Never render an
   *  incomplete read as a count. */
  complete: boolean;
  forms: FormReadResult[];
  errors: string[];
  fetchedMs: number;
}

/** Per-form page ceiling. 5000 submissions covers well beyond any single
 *  location's realistic volume for a bounded window. */
const MAX_ROWS_PER_FORM = 5000;

/** How many forms are walked at once. Connecteam rate-limits, and each form is
 *  itself several sequential pages, so this trades burst against wall clock. */
const CONCURRENCY = 4;

async function readForm(
  form: ProductionForm,
  fromTs: number,
  toTs: number,
  deadline: number,
  usersMap: Map<string, string>,
): Promise<{ result: FormReadResult; rows: ProductionRow[] }> {
  const result: FormReadResult = {
    formId: form.id,
    formName: form.name,
    fetched: 0,
    counted: 0,
    beforeActivation: 0,
    truncated: false,
  };

  const q = await getFormQuestions(form.id);
  if (q.error) {
    result.error = `form questions: ${q.error}`;
    return { result, rows: [] };
  }

  const s = await getSubmissions(form.id, fromTs, toTs, deadline, MAX_ROWS_PER_FORM);
  if (s.error) {
    result.error = `submissions: ${s.error}`;
    return { result, rows: [] };
  }
  result.fetched = s.submissions.length;
  result.truncated = s.truncated;

  const rows: ProductionRow[] = [];
  for (const sub of s.submissions) {
    const row = normalizeSubmission(sub, form, q.questions, usersMap);
    if (!withinActivation(row, form.activeFrom)) {
      result.beforeActivation += 1;
      continue;
    }
    rows.push(row);
  }
  result.counted = rows.length;
  return { result, rows };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Every production row Connecteam holds for [from, to], across every active
 * form.
 *
 * @param budgetMs wall-clock ceiling. The route runs under a 60s function limit,
 *                 so leave headroom for the fallback read that follows a miss.
 */
export async function fetchLiveProduction(opts: {
  from: string;
  to: string;
  budgetMs?: number;
  /** Restrict to forms/rows for one location. Filtering happens after
   *  normalization, since a form can carry several locations. */
  location?: string;
}): Promise<LiveRead> {
  const started = Date.now();
  const { from, to, budgetMs = 20_000, location } = opts;
  const deadline = started + budgetMs;
  const base: LiveRead = { rows: [], complete: false, forms: [], errors: [], fetchedMs: 0 };

  if (!connecteamConfigured()) {
    return { ...base, errors: ['CONNECTEAM_API_KEY not set'], fetchedMs: Date.now() - started };
  }

  const roster = await loadRoster();
  const forms = formsCoveringRange(roster.forms, to);
  if (!forms.length) {
    return {
      ...base,
      complete: true,
      errors: roster.error ? [roster.error] : [],
      fetchedMs: Date.now() - started,
    };
  }

  const { fromTs, toTs } = windowBounds(from, to);
  const usersMap = await getUsersMap();

  const results = await mapWithConcurrency(forms, CONCURRENCY, (form) =>
    readForm(form, fromTs, toTs, deadline, usersMap),
  );

  const rows: ProductionRow[] = [];
  const formResults: FormReadResult[] = [];
  const errors: string[] = roster.error ? [roster.error] : [];
  for (const r of results) {
    formResults.push(r.result);
    if (r.result.error) errors.push(`${r.result.formName ?? r.result.formId}: ${r.result.error}`);
    if (r.result.truncated) {
      errors.push(`${r.result.formName ?? r.result.formId}: read truncated before the window was covered`);
    }
    rows.push(...r.rows);
  }

  const filtered = location
    ? rows.filter((r) => r.location.toLowerCase().includes(location.toLowerCase()))
    : rows;

  // Complete only if every form was walked end to end. A roster fallback still
  // counts as complete for the forms it did cover, but is reported.
  const complete = formResults.every((f) => !f.error && !f.truncated);

  return { rows: filtered, complete, forms: formResults, errors, fetchedMs: Date.now() - started };
}

// ---- form coverage ---------------------------------------------------------

export interface FormCoverage {
  id: string;
  name: string;
  /** Is this form on the production_forms roster (i.e. does it feed reports)? */
  onRoster: boolean;
  /** Roster activation date, when it is on the roster. */
  activeFrom: string | null;
  enabled: boolean;
  /** Submissions inside the window. Null when not counted (see countSubmissions). */
  submissions: number | null;
  /** True when the walk stopped before covering the window — the count is a
   *  floor, not a total. */
  truncated: boolean;
  error?: string;
}

export interface FormCoverageResult {
  window: { from: string; to: string };
  forms: FormCoverage[];
  /** Roster entries Connecteam did not return at all — a form deleted or
   *  renamed over there while the roster still expects it. */
  rosterOrphans: { id: string; name: string | null }[];
  complete: boolean;
  errors: string[];
  fetchedMs: number;
}

/**
 * Every form Connecteam holds, next to the roster that decides which of them
 * feed a report — and, optionally, how many submissions each has in a window.
 *
 * This is the answer to "is that location idle, or is nothing reading it?",
 * which no amount of querying the synced copy can settle: a form nobody syncs
 * and a location doing no work look identical downstream.
 */
export async function fetchFormCoverage(opts: {
  from: string;
  to: string;
  /** Counting walks each form's submissions and is much slower than listing.
   *  Off by default so the listing itself is always cheap. */
  countSubmissions?: boolean;
  budgetMs?: number;
}): Promise<FormCoverageResult> {
  const started = Date.now();
  const { from, to, countSubmissions = false, budgetMs = 25_000 } = opts;
  const deadline = started + budgetMs;
  const base: FormCoverageResult = {
    window: { from, to },
    forms: [],
    rosterOrphans: [],
    complete: false,
    errors: [],
    fetchedMs: 0,
  };

  if (!connecteamConfigured()) {
    return { ...base, errors: ['CONNECTEAM_API_KEY not set'], fetchedMs: Date.now() - started };
  }

  const [listed, roster] = await Promise.all([listForms(), loadRoster()]);
  if (listed.error) {
    return { ...base, errors: [listed.error], fetchedMs: Date.now() - started };
  }
  const errors: string[] = roster.error ? [roster.error] : [];
  const byId = new Map(roster.forms.map((f) => [f.id, f]));

  const { fromTs, toTs } = windowBounds(from, to);

  const forms: FormCoverage[] = await mapWithConcurrency(listed.forms, CONCURRENCY, async (f) => {
    const rosterEntry = byId.get(f.id);
    const row: FormCoverage = {
      id: f.id,
      name: f.name,
      onRoster: Boolean(rosterEntry),
      activeFrom: rosterEntry?.activeFrom ?? null,
      enabled: Boolean(rosterEntry),
      submissions: null,
      truncated: false,
    };
    if (!countSubmissions) return row;
    const s = await getSubmissions(f.id, fromTs, toTs, deadline, MAX_ROWS_PER_FORM);
    if (s.error) {
      row.error = s.error;
      return row;
    }
    row.submissions = s.submissions.length;
    row.truncated = s.truncated;
    return row;
  });

  for (const f of forms) {
    if (f.error) errors.push(`${f.name || f.id}: ${f.error}`);
    if (f.truncated) errors.push(`${f.name || f.id}: submission walk truncated — count is a floor`);
  }

  const seen = new Set(forms.map((f) => f.id));
  const rosterOrphans = roster.forms
    .filter((f) => !seen.has(f.id))
    .map((f) => ({ id: f.id, name: f.name }));
  if (rosterOrphans.length) {
    errors.push(
      `${rosterOrphans.length} roster form(s) were not returned by Connecteam — deleted or renamed there`,
    );
  }

  return {
    window: { from, to },
    forms: forms.sort((a, b) => (b.submissions ?? -1) - (a.submissions ?? -1) || a.name.localeCompare(b.name)),
    rosterOrphans,
    complete: !errors.length,
    errors,
    fetchedMs: Date.now() - started,
  };
}
