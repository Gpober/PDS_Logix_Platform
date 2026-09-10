// The Connecteam Forms API, and the one normalizer that turns a form submission
// into a production row.
//
// Both the live read (lib/connecteam/live.ts) and the nightly backup sync
// (lib/connecteam/sync.ts) go through here. That is deliberate: congruency
// between what a report shows live and what the database holds is only
// meaningful if both sides derive from identical parsing. Any change to field
// matching or location resolution must happen here, once, for both.
//
// API shape (unchanged, proven over months of hourly syncing):
//   - forms:   GET /forms/v1/forms?limit=200
//   - list:    GET /forms/v1/forms/{id}/form-submissions?offset&limit  (NEWEST
//              first, no date filter — the window is applied client-side on
//              submissionTimestamp, and pagination stops once a page runs past it)
//   - answers: [{ questionId, selectedAnswers: [{ text, value }] | value }]
//   - identity: entryNum is the Connecteam "#" column, i.e. the same id the xlsx
//              export carries. It is unique per FORM, not globally — which is
//              why a production row is keyed by (form_id, external_id).

const BASE = 'https://api.connecteam.com';

export const connecteamConfigured = (): boolean => Boolean(process.env.CONNECTEAM_API_KEY);

export const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** A production row, in exactly the shape production_entries stores. */
export interface ProductionRow {
  form_id: string;
  external_id: string | null;
  location: string;
  staff_name: string | null;
  submitted_at: string | null;
  service_type: string | null;
  vehicle_year: number | null;
  vin_last6: string | null;
  model_type: string | null;
  capture: string | null;
  work_order_number: string | null;
  note: string | null;
  status: string | null;
  source: 'connecteam';
}

export interface ProductionForm {
  id: string;
  name: string | null;
  /** YYYY-MM-DD. Submissions before this date are not counted — see migration
   *  0027: a newly discovered form counts going forward only, so switching a
   *  location on never moves a payroll period that has already been reported. */
  activeFrom: string | null;
}

/** Forms that were hardcoded before the roster table existed. They carry full
 *  history and are seeded into production_forms with a 2000-01-01 activation. */
export const LEGACY_FORMS: { id: string; name: string }[] = [
  { id: '4875728', name: 'Manheim Dallas' },
  { id: '4918561', name: 'Manheim Atlanta' },
  { id: '6073028', name: 'Manheim Tampa' },
];

// A form whose submissions are one-per-vehicle. Slider forms (Mazda / VW record
// a count per shift rather than a submission per vehicle) would each land as a
// single "unit", so they are excluded by name.
export const PRODUCTION_FORM_RE = /entr|production|manheim|vehicle|unit|condition|photo/i;
export const NON_PRODUCTION_FORM_RE = /slider|count per|tally|headcount|survey|checklist|onboard|incident|expense|timesheet/i;

export function looksLikeProductionForm(name: string | null | undefined): boolean {
  const n = norm(name);
  if (!n) return false;
  if (NON_PRODUCTION_FORM_RE.test(n)) return false;
  return PRODUCTION_FORM_RE.test(n);
}

// Location names as the business writes them, for matching an answer or a form
// name to a canonical location.
export const KNOWN_LOCATIONS = [
  'Manheim Atlanta',
  'Manheim Dallas',
  'Manheim Tampa',
  'Manheim Charlotte',
  'Manheim Chicago',
  'Manheim St. Pete',
  'Manheim Central Florida',
  'Manheim DFW',
  'Manheim New Jersey',
  'Manheim North Carolina',
  'Manheim Georgia',
  'Enterprise Alabama',
  'Enterprise Atlanta',
  'Enterprise Orlando',
  'Enterprise Fort Pierce',
  'Mazda of South Charlotte',
  'Volkswagen Panama City',
  'Honda Panama City',
  'Ford Panama City',
];

export interface CtError {
  __error: string;
  status?: number;
}

async function ct(path: string): Promise<any> {
  const key = process.env.CONNECTEAM_API_KEY;
  if (!key) return { __error: 'CONNECTEAM_API_KEY not set' };
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-API-Key': key, accept: 'application/json' },
      cache: 'no-store',
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }
    if (!res.ok) return { __error: `${res.status} ${text.slice(0, 300)}`, status: res.status };
    return json ?? {};
  } catch (e) {
    return { __error: e instanceof Error ? e.message : 'fetch failed' };
  }
}

// Response shapes vary; pull the first array we recognize.
function firstArray(obj: any, keys: string[]): any[] {
  for (const k of keys) {
    const v = obj?.data?.[k] ?? obj?.[k];
    if (Array.isArray(v)) return v;
  }
  if (Array.isArray(obj?.data)) return obj.data;
  if (Array.isArray(obj)) return obj;
  return [];
}

export async function listForms(): Promise<{ forms: { id: string; name: string }[]; error?: string; raw?: unknown }> {
  const j = await ct('/forms/v1/forms?limit=200');
  if (j.__error) return { error: j.__error as string, forms: [], raw: j };
  const forms = firstArray(j, ['forms', 'formTemplates'])
    .map((f: any) => ({ id: String(f.id ?? f.formId ?? ''), name: String(f.name ?? f.title ?? '') }))
    .filter((f: { id: string }) => f.id);
  return { forms, raw: j };
}

export interface Question {
  id: string;
  title: string;
}

// Questions can sit under sections, so walk the whole form object for anything
// that looks like a question list.
function collectQuestions(node: any, out: Question[] = [], depth = 0): Question[] {
  if (!node || typeof node !== 'object' || depth > 6) return out;
  if (Array.isArray(node)) {
    for (const child of node) collectQuestions(child, out, depth + 1);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value) && /questions?$/i.test(key)) {
      for (const q of value as any[]) {
        const id = String(q?.id ?? q?.questionId ?? '');
        const title = String(q?.title ?? q?.name ?? q?.label ?? '');
        if (id && title && !out.some((e) => e.id === id)) out.push({ id, title });
        collectQuestions(q, out, depth + 1);
      }
    } else if (value && typeof value === 'object') {
      collectQuestions(value, out, depth + 1);
    }
  }
  return out;
}

export async function getFormQuestions(formId: string) {
  const j = await ct(`/forms/v1/forms/${formId}`);
  if (j.__error) return { error: j.__error as string, questions: [] as Question[], raw: j };
  const form = j?.data?.form ?? j?.data ?? j?.form ?? j;
  return { questions: collectQuestions(form), raw: j };
}

export function submissionTs(sub: any): number | null {
  const ts =
    sub?.submissionTimestamp ?? sub?.submitTimestamp ?? sub?.timestamp ?? sub?.createdAt ?? sub?.submittedAt;
  if (ts == null || ts === '') return null;
  if (typeof ts === 'number') return ts < 1e12 ? ts : Math.floor(ts / 1000);
  const parsed = Date.parse(String(ts));
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

/**
 * Submissions for one form inside a timestamp window. The API returns newest
 * first and takes no date filter, so we page until we run past the window.
 *
 * `truncated` means the page budget or the deadline ran out before the window
 * was fully walked — the caller MUST treat a truncated result as incomplete
 * rather than as a smaller count, which is the failure mode that let silent
 * undercounts through before.
 */
export async function getSubmissions(
  formId: string,
  fromTs: number,
  toTs: number,
  deadline = Number.POSITIVE_INFINITY,
  maxRows = 5000,
): Promise<{ submissions: any[]; error?: string; raw?: unknown; truncated: boolean }> {
  const out: any[] = [];
  let offset = 0;
  const limit = 100;
  let firstPage: any = undefined;
  for (;;) {
    const j = await ct(`/forms/v1/forms/${formId}/form-submissions?offset=${offset}&limit=${limit}`);
    if (j.__error) return { error: j.__error as string, submissions: out, raw: j, truncated: false };
    if (offset === 0) firstPage = j;
    const batch = firstArray(j, ['formSubmissions', 'submissions']);

    let sawOlder = false;
    for (const sub of batch) {
      const ts = submissionTs(sub);
      if (ts == null) continue;
      if (ts < fromTs) sawOlder = true;
      else if (ts <= toTs) out.push(sub);
    }

    // Newest-first: once a page reaches past the start of the window, everything
    // after it is older still.
    if (sawOlder || batch.length < limit) return { submissions: out, raw: firstPage, truncated: false };
    offset += limit;
    if (offset >= maxRows || Date.now() > deadline) {
      return { submissions: out, raw: firstPage, truncated: true };
    }
  }
}

/** userId -> "First Last", best effort, so a row links to a staff member. */
export async function getUsersMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const j = await ct(`/users/v1/users?page=${page}&limit=100`);
    if (j.__error) return map;
    const users = firstArray(j, ['users']);
    for (const u of users) {
      const id = String(u.userId ?? u.id ?? '');
      const name = norm(`${u.firstName ?? ''} ${u.lastName ?? ''}`);
      if (id && name) map.set(id, name);
    }
    if (users.length < 100) break;
  }
  return map;
}

// Field matchers — identical intent to the xlsx import's column regexes.
export const MATCH = {
  vin: [/vin/i],
  model: [/model/i],
  service: [/service\s*type/i, /^service$/i],
  year: [/^year$/i],
  capture: [/^capture$/i],
  location: [/^location$/i, /location/i],
  workOrder: [/work\s*order/i],
  note: [/^note$/i, /notes/i],
  status: [/^status$/i],
  name: [/full\s*name/i, /^name$/i, /employee/i],
};

// A multiple-choice answer carries its text in selectedAnswers[]; free text is on
// value. Flatten either into a plain string.
function answerText(v: any): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(answerText).filter(Boolean).join(', ');
  if (typeof v === 'object') return norm(v.text ?? v.value ?? v.name ?? v.label ?? '');
  return norm(v);
}

// A submission's answers can be an array [{questionId,...}] or a keyed object.
export function answerLookup(submission: any, questions: Question[]) {
  const byId = new Map<string, string>();
  const rawAnswers = submission?.answers ?? submission?.formAnswers ?? submission?.responses ?? [];
  if (Array.isArray(rawAnswers)) {
    for (const a of rawAnswers) {
      const qid = String(a?.questionId ?? a?.id ?? '');
      if (!qid) continue;
      const selected = a?.selectedAnswers ?? a?.selectedValues;
      const text =
        Array.isArray(selected) && selected.length
          ? answerText(selected)
          : answerText(a?.value ?? a?.answer ?? a?.text ?? a?.selectedValue);
      if (text) byId.set(qid, text);
    }
  } else if (rawAnswers && typeof rawAnswers === 'object') {
    for (const [qid, v] of Object.entries(rawAnswers)) {
      const text = answerText(v);
      if (text) byId.set(String(qid), text);
    }
  }
  return (res: RegExp[]): string => {
    for (const q of questions) {
      if (res.some((r) => r.test(q.title))) {
        const v = byId.get(q.id);
        if (v) return v;
      }
    }
    return '';
  };
}

export function matchKnownLocation(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  return KNOWN_LOCATIONS.find((loc) => lower.includes(loc.toLowerCase())) ?? null;
}

/**
 * One submission -> one production row. The single place field mapping lives, so
 * a live report and the stored copy can never disagree because they parsed
 * differently.
 */
export function normalizeSubmission(
  sub: any,
  form: ProductionForm,
  questions: Question[],
  usersMap: Map<string, string>,
): ProductionRow {
  const get = answerLookup(sub, questions);
  const submitterId = String(
    sub.submittingUserId ?? sub.submittedByUserId ?? sub.userId ?? sub.createdBy ?? '',
  );
  const staffName = get(MATCH.name) || usersMap.get(submitterId) || null;
  const ts = submissionTs(sub);
  const locationAnswer = get(MATCH.location);
  // Resolution order is fixed and total, so the same submission always resolves
  // to the same location: a recognized location in the answer, else the raw
  // answer, else a recognized location in the form name, else the form name.
  const location =
    matchKnownLocation(locationAnswer) ||
    locationAnswer ||
    matchKnownLocation(form.name ?? '') ||
    form.name ||
    'Unspecified';
  const yearRaw = Number(get(MATCH.year));
  return {
    form_id: form.id,
    external_id:
      String(sub.entryNum ?? sub.formSubmissionId ?? sub.id ?? sub.submissionId ?? '') || null,
    location,
    staff_name: staffName,
    submitted_at: ts == null ? null : new Date(ts * 1000).toISOString(),
    service_type: get(MATCH.service) || null,
    vehicle_year: Number.isFinite(yearRaw) && yearRaw > 1900 ? Math.trunc(yearRaw) : null,
    vin_last6: get(MATCH.vin) || null,
    model_type: get(MATCH.model) || null,
    capture: get(MATCH.capture) || null,
    work_order_number: get(MATCH.workOrder) || null,
    note: get(MATCH.note) || null,
    status: get(MATCH.status) || null,
    source: 'connecteam',
  };
}

/** Inclusive epoch-second bounds for a YYYY-MM-DD range, padded by 12h so a late
 *  local-evening submission isn't dropped by the UTC day boundary. Re-reading the
 *  overlap is free — rows are keyed by (form_id, external_id). */
export function windowBounds(from: string, to: string): { fromTs: number; toTs: number } {
  const fromTs = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 12 * 3600;
  const toTs = Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000) + 12 * 3600;
  return { fromTs, toTs };
}

export const isDay = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** A row counts only if its form was already active on the day it was submitted. */
export function withinActivation(row: ProductionRow, activeFrom: string | null): boolean {
  if (!activeFrom) return true;
  if (!row.submitted_at) return false;
  return row.submitted_at.slice(0, 10) >= activeFrom;
}
