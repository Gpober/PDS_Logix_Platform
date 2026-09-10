// The roster of Connecteam forms that count as production.
//
// Coverage used to be three ids hardcoded in the sync, which is why ~30 other
// Connecteam locations never appeared in a report. It now lives in the
// production_forms table (migration 0027) and is discovered from Connecteam
// itself, so a location added over there shows up here without a deploy.
//
// Every form carries an `active_from` date. A form discovered today starts
// counting today: switching a location on adds units going forward and never
// rewrites a period that has already been reported and paid. Backfilling a
// newly discovered location is a deliberate, separate act — set its
// active_from back and re-run the sync for that range.

import { createServiceSupabase, serviceConfigured } from '@/lib/supabase/service';
import { LEGACY_FORMS, listForms, looksLikeProductionForm, type ProductionForm } from './client';

export interface RosterRow {
  form_id: string;
  name: string | null;
  active_from: string;
  enabled: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

/** The roster as stored. Falls back to the legacy three if the table is
 *  unreachable, so a database blip degrades coverage rather than zeroing it. */
export async function loadRoster(): Promise<{ forms: ProductionForm[]; error?: string }> {
  if (!serviceConfigured()) {
    return { forms: legacyRoster(), error: 'SUPABASE_SERVICE_ROLE_KEY not set — using legacy form list' };
  }
  const supabase = createServiceSupabase();
  const { data, error } = await supabase
    .from('production_forms')
    .select('form_id, name, active_from, enabled')
    .eq('enabled', true);
  if (error) return { forms: legacyRoster(), error: error.message };
  const rows = (data ?? []) as RosterRow[];
  if (!rows.length) return { forms: legacyRoster() };
  return {
    forms: rows.map((r) => ({ id: r.form_id, name: r.name, activeFrom: r.active_from })),
  };
}

function legacyRoster(): ProductionForm[] {
  return LEGACY_FORMS.map((f) => ({ id: f.id, name: f.name, activeFrom: null }));
}

export interface DiscoveryResult {
  added: { form_id: string; name: string; active_from: string }[];
  known: number;
  scanned: number;
  error?: string;
}

/**
 * Ask Connecteam what forms exist and add any production-looking ones the roster
 * has not seen, active from today. Idempotent — a form already on the roster is
 * left exactly as it is, including a hand-edited active_from.
 */
export async function discoverForms(): Promise<DiscoveryResult> {
  const empty: DiscoveryResult = { added: [], known: 0, scanned: 0 };
  if (!serviceConfigured()) return { ...empty, error: 'SUPABASE_SERVICE_ROLE_KEY not set' };

  const listed = await listForms();
  if (listed.error) return { ...empty, error: listed.error };

  const supabase = createServiceSupabase();
  const { data, error } = await supabase.from('production_forms').select('form_id');
  if (error) return { ...empty, scanned: listed.forms.length, error: error.message };
  const known = new Set((data ?? []).map((r: { form_id: string }) => r.form_id));

  const candidates = listed.forms.filter(
    (f) => !known.has(f.id) && looksLikeProductionForm(f.name),
  );
  if (!candidates.length) {
    return { added: [], known: known.size, scanned: listed.forms.length };
  }

  const activeFrom = today();
  const rows = candidates.map((f) => ({
    form_id: f.id,
    name: f.name,
    active_from: activeFrom,
    note: 'Discovered automatically — counts from its activation date forward.',
  }));
  const { error: insertError } = await supabase
    .from('production_forms')
    .upsert(rows, { onConflict: 'form_id', ignoreDuplicates: true });
  if (insertError) {
    return { added: [], known: known.size, scanned: listed.forms.length, error: insertError.message };
  }
  return {
    added: rows.map((r) => ({ form_id: r.form_id, name: r.name, active_from: r.active_from })),
    known: known.size,
    scanned: listed.forms.length,
  };
}

/** Forms whose activation window overlaps [from, to] — the rest cannot
 *  contribute a countable row, so neither the live read nor the sync fetches
 *  them. */
export function formsCoveringRange(forms: ProductionForm[], to: string): ProductionForm[] {
  return forms.filter((f) => !f.activeFrom || f.activeFrom <= to);
}
