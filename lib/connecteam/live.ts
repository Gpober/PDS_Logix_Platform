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
