// Connecteam Forms → production_entries sync. The production "Entries" (one form
// submission per vehicle serviced) live in Connecteam Forms. This pulls a bounded
// date range (a single day stays small enough to dodge the timeout a full-history
// scan hits) and upserts into production_entries, mirroring the manual xlsx import
// (same fields, same dedupe by location + external_id).
//
// The app has never called Connecteam's API before, so response shapes are read
// defensively and `dryRun` returns the RAW payloads for verification before we
// trust the mapping.

import { createServiceSupabase } from '@/lib/supabase/service';

const BASE = 'https://api.connecteam.com';

export const connecteamConfigured = (): boolean => Boolean(process.env.CONNECTEAM_API_KEY);

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

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

export async function getFormQuestions(formId: string) {
  const j = await ct(`/forms/v1/forms/${formId}`);
  if (j.__error) return { error: j.__error, questions: [], raw: j };
  const form = j?.data?.form ?? j?.data ?? j?.form ?? j;
  const questions = firstArray(form, ['questions', 'formQuestions']).map((q: any) => ({
    id: String(q.id ?? q.questionId ?? ''),
    title: String(q.title ?? q.name ?? q.label ?? ''),
  }));
  return { questions, raw: j };
}

export async function getSubmissions(formId: string, from: string, to: string) {
  const out: any[] = [];
  let offset = 0;
  const limit = 200;
  for (;;) {
    const j = await ct(
      `/forms/v1/forms/${formId}/form-submissions?startDate=${from}&endDate=${to}&limit=${limit}&offset=${offset}`,
    );
    if (j.__error) return { error: j.__error, submissions: out, raw: j };
    const batch = firstArray(j, ['formSubmissions', 'submissions']);
    out.push(...batch);
    if (batch.length < limit) return { submissions: out, raw: offset === 0 ? j : undefined };
    offset += limit;
    if (offset > 10000) return { submissions: out }; // safety
  }
}

// userId -> "First Last", best effort, so a row links to a staff member.
async function getUsersMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const j = await ct('/users/v1/users?limit=500');
  if (j.__error) return map;
  for (const u of firstArray(j, ['users'])) {
    const id = String(u.userId ?? u.id ?? '');
    const name = norm(`${u.firstName ?? ''} ${u.lastName ?? ''}`);
    if (id && name) map.set(id, name);
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

// A submission's answers can be an array [{questionId,value}] or a keyed object.
function answerLookup(submission: any, questions: { id: string; title: string }[]) {
  const byId = new Map<string, any>();
  const rawAnswers = submission?.answers ?? submission?.formAnswers ?? submission?.responses ?? [];
  if (Array.isArray(rawAnswers)) {
    for (const a of rawAnswers) {
      const qid = String(a.questionId ?? a.id ?? '');
      byId.set(qid, a.value ?? a.answer ?? a.text ?? a.selectedValue ?? '');
    }
  } else if (rawAnswers && typeof rawAnswers === 'object') {
    for (const [qid, v] of Object.entries(rawAnswers)) byId.set(String(qid), v);
  }
  // title -> value
  const byTitle = (res: RegExp[]) => {
    const q = questions.find((qq) => res.some((r) => r.test(qq.title)));
    return q ? norm(byId.get(q.id)) : '';
  };
  return byTitle;
}

export interface SyncResult {
  ok: boolean;
  dryRun: boolean;
  formId: string | null;
  formName: string | null;
  range: { from: string; to: string };
  fetched: number;
  mapped: number;
  inserted: number;
  skipped: number;
  error?: string;
  sample?: unknown[];
  diagnostics?: unknown;
}

async function resolveFormId(): Promise<{ id: string | null; name: string | null; formsRaw?: unknown }> {
  const envId = process.env.CONNECTEAM_FORM_ID;
  if (envId) return { id: envId, name: null };
  const { forms, raw } = await listForms();
  const match =
    forms.find((f) => /entr|production|service|vehicle|unit/i.test(f.name)) ?? forms[0];
  return { id: match?.id ?? null, name: match?.name ?? null, formsRaw: raw };
}

export async function syncProductionEntries(opts: {
  from: string;
  to: string;
  dryRun?: boolean;
}): Promise<SyncResult> {
  const { from, to, dryRun = false } = opts;
  const base: SyncResult = {
    ok: false,
    dryRun,
    formId: null,
    formName: null,
    range: { from, to },
    fetched: 0,
    mapped: 0,
    inserted: 0,
    skipped: 0,
  };

  if (!connecteamConfigured()) return { ...base, error: 'CONNECTEAM_API_KEY not set' };

  const resolved = await resolveFormId();
  if (!resolved.id) {
    return { ...base, error: 'No production form found', diagnostics: resolved.formsRaw };
  }
  base.formId = resolved.id;
  base.formName = resolved.name;

  const q = await getFormQuestions(resolved.id);
  if (q.error) return { ...base, error: `form questions: ${q.error}`, diagnostics: q.raw };

  const s = await getSubmissions(resolved.id, from, to);
  if (s.error) return { ...base, error: `submissions: ${s.error}`, diagnostics: s.raw };
  base.fetched = s.submissions.length;

  const usersMap = await getUsersMap();

  const rows = s.submissions.map((sub: any) => {
    const get = answerLookup(sub, q.questions);
    const submitterId = String(sub.submittedByUserId ?? sub.userId ?? sub.createdBy ?? '');
    const nameFromAnswer = get(MATCH.name);
    const staffName = nameFromAnswer || usersMap.get(submitterId) || null;
    const ts = sub.submitTimestamp ?? sub.timestamp ?? sub.createdAt ?? sub.submittedAt;
    const submittedAt =
      typeof ts === 'number'
        ? new Date(ts * (ts < 1e12 ? 1000 : 1)).toISOString()
        : ts
          ? new Date(ts).toISOString()
          : null;
    const yearRaw = Number(get(MATCH.year));
    return {
      external_id: String(sub.id ?? sub.submissionId ?? sub.formSubmissionId ?? '') || null,
      location: get(MATCH.location) || 'Unspecified',
      staff_name: staffName,
      submitted_at: submittedAt,
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
  base.mapped = rows.length;

  if (dryRun) {
    return {
      ...base,
      ok: true,
      sample: rows.slice(0, 5),
      diagnostics: {
        formQuestions: q.questions,
        firstRawSubmission: s.submissions[0] ?? null,
      },
    };
  }

  if (!rows.length) return { ...base, ok: true };

  const supabase = createServiceSupabase();

  // Link staff by name.
  const staffByName = new Map<string, string>();
  {
    const { data } = await supabase.from('staff').select('id, name');
    for (const st of (data ?? []) as { id: string; name: string | null }[]) {
      const n = norm(st.name).toLowerCase();
      if (n) staffByName.set(n, st.id);
    }
  }

  // Dedupe against existing per location (idempotent).
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
  base.skipped = rows.length - fresh.length;

  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500);
    const { error } = await supabase.from('production_entries').insert(chunk);
    if (error) errors.push(error.message);
    else inserted += chunk.length;
  }
  base.inserted = inserted;

  return { ...base, ok: errors.length === 0 || inserted > 0, error: errors[0] };
}
