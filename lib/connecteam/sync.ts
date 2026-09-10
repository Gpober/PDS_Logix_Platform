// Connecteam Forms -> production_entries. The BACKUP path.
//
// Reports and MCP requests now read Connecteam live (lib/production/source.ts);
// this keeps a durable copy underneath so history stays queryable and a
// Connecteam outage degrades a report rather than emptying it.
//
// What changed, and why it matters for congruency:
//
//   * Upsert, not insert-and-skip. The old sync deduped by (location,
//     external_id) and SKIPPED anything already present, so a submission edited
//     in Connecteam after its first sync never updated — the copy diverged
//     permanently and one-directionally. Rows now upsert on
//     (form_id, external_id), so a re-sync of a window repairs it.
//
//   * Coverage comes from the production_forms roster, not three ids in this
//     file, and new forms are discovered from Connecteam each run. A form counts
//     from its activation date forward, so switching a location on never moves a
//     payroll period that has already been reported.
//
//   * A partial run fails. `ok` used to be true if any single form succeeded,
//     and a truncated read looked identical to a quiet day. Both are errors now.
//
//   * Deletions can be reconciled with `prune`, off by default: a row the live
//     read no longer sees is removed only when explicitly asked, because a
//     truncated live read must never be allowed to delete real history.

import { createServiceSupabase } from '@/lib/supabase/service';
import { connecteamConfigured, isDay, type ProductionRow } from './client';
import { discoverForms } from './forms';
import { fetchLiveProduction, type FormReadResult } from './live';

export { connecteamConfigured } from './client';

export interface SyncResult {
  ok: boolean;
  dryRun: boolean;
  range: { from: string; to: string };
  forms: FormReadResult[];
  discovered: { form_id: string; name: string; active_from: string }[];
  fetched: number;
  /** Rows written (inserted or updated) — an upsert does not distinguish. */
  upserted: number;
  pruned: number;
  errors: string[];
  error?: string;
  sample?: ProductionRow[];
}

const CHUNK = 500;

export async function syncProductionEntries(opts: {
  from: string;
  to: string;
  dryRun?: boolean;
  /** Remove stored rows in this window that the live read no longer sees.
   *  Requires a complete live read; refused otherwise. */
  prune?: boolean;
  /** Wall-clock budget in ms; the route runs under a 60s function limit. */
  budgetMs?: number;
}): Promise<SyncResult> {
  const { from, to, dryRun = false, prune = false, budgetMs = 40_000 } = opts;
  const base: SyncResult = {
    ok: false,
    dryRun,
    range: { from, to },
    forms: [],
    discovered: [],
    fetched: 0,
    upserted: 0,
    pruned: 0,
    errors: [],
  };

  if (!connecteamConfigured()) return { ...base, error: 'CONNECTEAM_API_KEY not set', errors: ['CONNECTEAM_API_KEY not set'] };
  if (!isDay(from) || !isDay(to) || from > to) {
    return { ...base, error: 'from/to must be YYYY-MM-DD with from <= to', errors: ['bad range'] };
  }

  // Pick up locations added in Connecteam since the last run. Each starts
  // counting from today, so this never rewrites a reported period.
  const discovery = await discoverForms();
  base.discovered = discovery.added;
  if (discovery.error) base.errors.push(`form discovery: ${discovery.error}`);

  const live = await fetchLiveProduction({ from, to, budgetMs });
  base.forms = live.forms;
  base.fetched = live.rows.length;
  base.errors.push(...live.errors);

  if (dryRun) {
    return { ...base, ok: live.complete, sample: live.rows.slice(0, 5), error: base.errors[0] };
  }

  const supabase = createServiceSupabase();

  // Staff name -> id, so each unit links to a team member.
  const staffByName = new Map<string, string>();
  {
    const { data } = await supabase.from('staff').select('id, name');
    for (const st of (data ?? []) as { id: string; name: string | null }[]) {
      const n = String(st.name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (n) staffByName.set(n, st.id);
    }
  }

  // Only rows Connecteam gives an entry number can be upserted on identity;
  // anything else would insert a fresh duplicate on every run.
  const writable = live.rows.filter((r) => r.external_id);
  const skippedNoId = live.rows.length - writable.length;
  if (skippedNoId) base.errors.push(`${skippedNoId} submission(s) had no entry number and were not stored`);

  const rows = writable.map((r) => ({
    ...r,
    staff_id: r.staff_name ? staffByName.get(r.staff_name.toLowerCase()) ?? null : null,
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('production_entries')
      .upsert(chunk, { onConflict: 'form_id,external_id' });
    if (error) base.errors.push(`upsert rows ${i}-${i + chunk.length - 1}: ${error.message}`);
    else base.upserted += chunk.length;
  }

  if (prune) {
    if (!live.complete) {
      base.errors.push('prune refused: the live read was incomplete, so absent rows are not proven deleted');
    } else {
      base.pruned = await pruneMissing(supabase, from, to, live.rows, base.errors);
    }
  }

  // Record that these forms were reached, so a form going quiet is visible.
  const reached = live.forms.filter((f) => !f.error && !f.truncated).map((f) => f.formId);
  if (reached.length) {
    const { error } = await supabase
      .from('production_forms')
      .update({ last_synced_at: new Date().toISOString() })
      .in('form_id', reached);
    if (error) base.errors.push(`roster stamp: ${error.message}`);
  }

  const ok = live.complete && !base.errors.length;
  return { ...base, ok, error: base.errors[0] };
}

/** Delete stored rows in the window that a COMPLETE live read did not return —
 *  submissions voided in Connecteam. Only touches rows the sync itself owns
 *  (source 'connecteam' with a form id), never a hand-imported row. */
async function pruneMissing(
  supabase: ReturnType<typeof createServiceSupabase>,
  from: string,
  to: string,
  liveRows: ProductionRow[],
  errors: string[],
): Promise<number> {
  const upper = new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  const alive = new Set(liveRows.map((r) => `${r.form_id}:${r.external_id}`));

  const doomed: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from('production_entries')
      .select('id, form_id, external_id')
      .eq('source', 'connecteam')
      .not('form_id', 'is', null)
      .gte('submitted_at', from)
      .lt('submitted_at', upper)
      .range(offset, offset + 999);
    if (error) {
      errors.push(`prune scan: ${error.message}`);
      return 0;
    }
    const batch = (data ?? []) as { id: string; form_id: string; external_id: string | null }[];
    for (const r of batch) {
      if (!alive.has(`${r.form_id}:${r.external_id}`)) doomed.push(r.id);
    }
    if (batch.length < 1000) break;
  }

  let pruned = 0;
  for (let i = 0; i < doomed.length; i += CHUNK) {
    const chunk = doomed.slice(i, i + CHUNK);
    const { error } = await supabase.from('production_entries').delete().in('id', chunk);
    if (error) errors.push(`prune delete: ${error.message}`);
    else pruned += chunk.length;
  }
  return pruned;
}
