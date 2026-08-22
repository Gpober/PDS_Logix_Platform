// Connecteam Forms → production_entries sync. The production "Entries" (one form
// submission per vehicle serviced) live in Connecteam Forms — one form per
// location. This pulls a bounded date range across every production form and
// upserts into production_entries, mirroring the manual xlsx import (same fields,
// same dedupe by location + external_id).
//
// Shapes here follow the proven hourly sync in the pdsLogix repo
// (scripts/incremental-sync-connecteam.ts), which has been pulling these same
// forms for months:
//   - list:    GET /forms/v1/forms/{id}/form-submissions?offset&limit  (NEWEST first,
//              no date filter — the window is applied client-side on
//              submissionTimestamp, and pagination stops once a page runs past it)
//   - answers: [{ questionId, selectedAnswers: [{ text, value }] | value }]
//   - identity: entryNum is the Connecteam "#" column, i.e. the same id the xlsx
//              export carries — so external_id matches rows already imported by
//              hand and re-syncing never double-counts a unit.

import { createServiceSupabase } from '@/lib/supabase/service';

const BASE = 'https://api.connecteam.com';

export const connecteamConfigured = (): boolean => Boolean(process.env.CONNECTEAM_API_KEY);

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

// The per-vehicle production forms (one row per unit). The Mazda / VW forms are
// deliberately NOT here: those are slider forms that record a count per shift
// rather than a submission per vehicle, so they'd land as one "unit" each.
// Override with CONNECTEAM_FORM_IDS="123,456" (comma-separated) to change scope.
const DEFAULT_FORMS: { id: string; name: string }[] = [
  { id: '4875728', name: 'Manheim Dallas' },
  { id: '4918561', name: 'Manheim Atlanta' },
  { id: '6073028', name: 'Manheim Tampa' },
];

// Location names as the business writes them, for matching an answer or a form
// name to a canonical location.
const KNOWN_LOCATIONS = [
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
  'Enterprise Alabama',
  'Enterprise Atlanta',
  'Enterprise Fort Pierce',
  'Mazda of South Charlotte',
  'Volkswagen Panama City',
  'Honda Panama City',
  'Ford Panama City',
];

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
    if (!res.ok) return { __error: `${res.status} ${text.slice(0, 300)}` };
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

export async function listForms() {
  const j = await ct('/forms/v1/forms?limit=200');
  if (j.__error) return { error: j.__error, forms: [], raw: j };
  const forms = firstArray(j, ['forms', 'formTemplates']).map((f: any) => ({
    id: String(f.id ?? f.formId ?? ''),
    name: String(f.name ?? f.title ?? ''),
  }));
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
  if (j.__error) return { error: j.__error, questions: [] as Question[], raw: j };
  const form = j?.data?.form ?? j?.data ?? j?.form ?? j;
  return { questions: collectQuestions(form), raw: j };
}

/**
 * Submissions for one form inside a timestamp window. The API returns newest
 * first and takes no date filter, so we page until we run past the window.
 */
export async function getSubmissions(
  formId: string,
  fromTs: number,
  toTs: number,
  deadline = Number.POSITIVE_INFINITY,
) {
  const out: any[] = [];
  let offset = 0;
  const limit = 100;
  let firstPage: any = undefined;
  for (;;) {
    const j = await ct(
      `/forms/v1/forms/${formId}/form-submissions?offset=${offset}&limit=${limit}`,
    );
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
    if (offset >= 5000 || Date.now() > deadline) {
      return { submissions: out, raw: firstPage, truncated: true };
    }
  }
}

function submissionTs(sub: any): number | null {
  const ts = sub?.submissionTimestamp ?? sub?.submitTimestamp ?? sub?.timestamp ?? sub?.createdAt ?? sub?.submittedAt;
  if (ts == null || ts === '') return null;
  if (typeof ts === 'number') return ts < 1e12 ? ts : Math.floor(ts / 1000);
  const parsed = Date.parse(String(ts));
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

// userId -> "First Last", best effort, so a row links to a staff member.
async function getUsersMap(): Promise<Map<string, string>> {
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
const MATCH = {
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
function answerLookup(submission: any, questions: Question[]) {
  const byId = new Map<string, string>();
  const rawAnswers = submission?.answers ?? submission?.formAnswers ?? submission?.responses ?? [];
  if (Array.isArray(rawAnswers)) {
    for (const a of rawAnswers) {
      const qid = String(a?.questionId ?? a?.id ?? '');
      if (!qid) continue;
      const selected = a?.selectedAnswers ?? a?.selectedValues;
      const text = Array.isArray(selected) && selected.length
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
  // title -> value
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

function matchKnownLocation(text: string): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  return KNOWN_LOCATIONS.find((loc) => lower.includes(loc.toLowerCase())) ?? null;
}

export interface FormSyncResult {
  formId: string;
  formName: string | null;
  fetched: number;
  mapped: number;
  inserted: number;
  skipped: number;
  truncated?: boolean;
  error?: string;
}

export interface SyncResult {
  ok: boolean;
  dryRun: boolean;
  forms: FormSyncResult[];
  range: { from: string; to: string };
  fetched: number;
  mapped: number;
  inserted: number;
  skipped: number;
  error?: string;
  sample?: unknown[];
  diagnostics?: unknown;
}

async function resolveForms(): Promise<{ forms: { id: string; name: string | null }[]; formsRaw?: unknown }> {
  const env = process.env.CONNECTEAM_FORM_IDS ?? process.env.CONNECTEAM_FORM_ID;
  if (env) {
    const ids = env.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) {
      const known = new Map(DEFAULT_FORMS.map((f) => [f.id, f.name]));
      return { forms: ids.map((id) => ({ id, name: known.get(id) ?? null })) };
    }
  }
  if (DEFAULT_FORMS.length) return { forms: DEFAULT_FORMS };
  // Fallback (only if the defaults are ever emptied): discover by name.
  const { forms, raw } = await listForms();
  const matches = forms.filter((f) => /entr|production|manheim|vehicle|unit/i.test(f.name));
  return { forms: matches.length ? matches : forms.slice(0, 1), formsRaw: raw };
}

/** Inclusive epoch-second bounds for a YYYY-MM-DD range, padded by 12h so a late
 *  local-evening submission isn't dropped by the UTC day boundary. Re-syncing the
 *  overlap is free — the dedupe is by (location, external_id). */
function windowBounds(from: string, to: string): { fromTs: number; toTs: number } {
  const fromTs = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 12 * 3600;
  const toTs = Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000) + 12 * 3600;
  return { fromTs, toTs };
}

export async function syncProductionEntries(opts: {
  from: string;
  to: string;
  dryRun?: boolean;
  /** Wall-clock budget in ms; the route runs under a 60s function limit. */
  budgetMs?: number;
}): Promise<SyncResult> {
  const { from, to, dryRun = false, budgetMs = 45_000 } = opts;
  const deadline = Date.now() + budgetMs;
  const base: SyncResult = {
    ok: false,
    dryRun,
    forms: [],
    range: { from, to },
    fetched: 0,
    mapped: 0,
    inserted: 0,
    skipped: 0,
  };

  if (!connecteamConfigured()) return { ...base, error: 'CONNECTEAM_API_KEY not set' };
  if (Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || Number.isNaN(Date.parse(`${to}T00:00:00Z`))) {
    return { ...base, error: 'from/to must be YYYY-MM-DD' };
  }

  const resolved = await resolveForms();
  if (!resolved.forms.length) {
    return { ...base, error: 'No production form found', diagnostics: resolved.formsRaw };
  }

  const { fromTs, toTs } = windowBounds(from, to);
  const usersMap = await getUsersMap();
  const supabase = dryRun ? null : createServiceSupabase();

  // Staff name -> id, so each unit links to a team member (one read for all forms).
  const staffByName = new Map<string, string>();
  if (supabase) {
    const { data } = await supabase.from('staff').select('id, name');
    for (const st of (data ?? []) as { id: string; name: string | null }[]) {
      const n = norm(st.name).toLowerCase();
      if (n) staffByName.set(n, st.id);
    }
  }

  const sample: unknown[] = [];
  const diagnostics: Record<string, unknown> = {};

  for (const form of resolved.forms) {
    const fr: FormSyncResult = {
      formId: form.id,
      formName: form.name,
      fetched: 0,
      mapped: 0,
      inserted: 0,
      skipped: 0,
    };
    base.forms.push(fr);

    const q = await getFormQuestions(form.id);
    if (q.error) {
      fr.error = `form questions: ${q.error}`;
      diagnostics[`form_${form.id}`] = q.raw;
      continue;
    }

    const s = await getSubmissions(form.id, fromTs, toTs, deadline);
    if (s.error) {
      fr.error = `submissions: ${s.error}`;
      diagnostics[`form_${form.id}`] = s.raw;
      continue;
    }
    fr.fetched = s.submissions.length;
    fr.truncated = s.truncated || undefined;
    base.fetched += fr.fetched;

    const rows = s.submissions.map((sub: any) => {
      const get = answerLookup(sub, q.questions);
      const submitterId = String(sub.submittingUserId ?? sub.submittedByUserId ?? sub.userId ?? sub.createdBy ?? '');
      const staffName = get(MATCH.name) || usersMap.get(submitterId) || null;
      const ts = submissionTs(sub);
      const locationAnswer = get(MATCH.location);
      const location =
        matchKnownLocation(locationAnswer) ??
        (locationAnswer || null) ??
        matchKnownLocation(form.name ?? '') ??
        form.name ??
        'Unspecified';
      const yearRaw = Number(get(MATCH.year));
      return {
        external_id: String(sub.entryNum ?? sub.formSubmissionId ?? sub.id ?? sub.submissionId ?? '') || null,
        location: location || 'Unspecified',
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
    });
    fr.mapped = rows.length;
    base.mapped += rows.length;

    if (dryRun) {
      if (sample.length < 5) sample.push(...rows.slice(0, 5 - sample.length));
      diagnostics[`form_${form.id}`] = {
        formQuestions: q.questions,
        firstRawSubmission: s.submissions[0] ?? null,
      };
      continue;
    }
    if (!rows.length || !supabase) continue;

    // Dedupe against what's already stored for these locations (idempotent, and
    // matches rows the xlsx import created — both key off the Connecteam "#").
    const locations = new Set(rows.map((r) => r.location));
    const existing = new Set<string>();
    for (const loc of locations) {
      let fromIdx = 0;
      for (;;) {
        const { data } = await supabase
          .from('production_entries')
          .select('external_id')
          .eq('location', loc)
          .not('external_id', 'is', null)
          .range(fromIdx, fromIdx + 999);
        const b = (data ?? []) as { external_id: string | null }[];
        for (const e of b) if (e.external_id) existing.add(`${loc}::${e.external_id}`);
        if (b.length < 1000) break;
        fromIdx += 1000;
      }
    }

    const fresh = rows
      .filter((r) => !(r.external_id && existing.has(`${r.location}::${r.external_id}`)))
      .map((r) => ({
        ...r,
        staff_id: r.staff_name ? staffByName.get(r.staff_name.toLowerCase()) ?? null : null,
      }));
    fr.skipped = rows.length - fresh.length;
    base.skipped += fr.skipped;

    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500);
      const { error } = await supabase.from('production_entries').insert(chunk);
      if (error) fr.error = error.message;
      else {
        fr.inserted += chunk.length;
        base.inserted += chunk.length;
      }
    }
  }

  const errors = base.forms.filter((f) => f.error);
  const result: SyncResult = {
    ...base,
    ok: errors.length < base.forms.length,
    error: errors[0]?.error,
  };
  if (dryRun) {
    result.ok = errors.length < base.forms.length;
    result.sample = sample;
    result.diagnostics = diagnostics;
  } else if (errors.length) {
    result.diagnostics = diagnostics;
  }
  return result;
}
