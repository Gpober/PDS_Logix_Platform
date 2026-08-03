import { createServerSupabase } from '@/lib/supabase/server';

// Car-count reconciliation — our units vs the auction's (Manheim).
//
// A batch is one reconciliation: their uploaded unit list for a location and
// period, matched against our side. Our side is the production log by default;
// if a file is uploaded for our side too, that file wins. All the matching math
// lives in Postgres (recon_rows / get_recon_summary / get_recon_exceptions) so
// the dashboard and Zordon always read the same numbers.

export interface ReconBatch {
  id: string;
  label: string;
  counterparty: string;
  location: string | null;
  period_start: string | null;
  period_end: string | null;
  ours_file: string | null;
  theirs_file: string | null;
  ours_rows: number;
  theirs_rows: number;
  note: string | null;
  created_at: string;
}

export type ReconStatus = 'matched' | 'only_ours' | 'only_theirs' | 'no_vin';

export interface ReconRow {
  side: 'ours' | 'theirs';
  vin6: string | null;
  vin: string | null;
  serviced_on: string | null;
  location: string | null;
  service_type: string | null;
  vehicle_desc: string | null;
  external_ref: string | null;
  amount: number | null;
  staff_name: string | null;
  status: ReconStatus;
}

export interface ReconSummary {
  batch: ReconBatch | null;
  ours_source: 'uploaded_file' | 'production_log';
  ours_units: number;
  theirs_units: number;
  variance: number;          // ours − theirs
  matched_units: number;
  only_ours: number;         // we logged it, their list doesn't have it
  only_theirs: number;       // they billed/listed it, we have no record
  no_vin_ours: number;
  no_vin_theirs: number;
  match_rate: number;        // % of their units we matched
  their_amount_total: number;
  amount_only_theirs: number;
  amount_only_ours: number;
  date_from: string | null;
  date_to: string | null;
  by_day: { day: string; ours: number; theirs: number; variance: number }[];
  by_location: { location: string; ours: number; theirs: number; variance: number }[];
  by_service: { service_type: string; ours: number; theirs: number; variance: number }[];
}

const EMPTY_SUMMARY: ReconSummary = {
  batch: null,
  ours_source: 'production_log',
  ours_units: 0,
  theirs_units: 0,
  variance: 0,
  matched_units: 0,
  only_ours: 0,
  only_theirs: 0,
  no_vin_ours: 0,
  no_vin_theirs: 0,
  match_rate: 0,
  their_amount_total: 0,
  amount_only_theirs: 0,
  amount_only_ours: 0,
  date_from: null,
  date_to: null,
  by_day: [],
  by_location: [],
  by_service: [],
};

export async function listReconBatches(): Promise<ReconBatch[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('recon_batches').select('*').order('created_at', { ascending: false });
  return (data ?? []) as ReconBatch[];
}

export async function getReconBatch(id: string): Promise<ReconBatch | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('recon_batches').select('*').eq('id', id).maybeSingle();
  return (data ?? null) as ReconBatch | null;
}

// Fuzzy batch lookup for the assistant: an id, a label ("Manheim Dallas March"),
// or nothing at all → the most recent batch.
export async function resolveReconBatch(hint?: string): Promise<{ batch?: ReconBatch; error?: string; candidates?: string[] }> {
  const batches = await listReconBatches();
  if (!batches.length) return { error: 'No reconciliations have been uploaded yet. Upload the Manheim file on the Car Count Recon page (/crm/recon).' };
  const q = (hint ?? '').trim().toLowerCase();
  if (!q) return { batch: batches[0] };
  const byId = batches.find((b) => b.id === hint);
  if (byId) return { batch: byId };
  const hits = batches.filter((b) => `${b.label} ${b.counterparty} ${b.location ?? ''}`.toLowerCase().includes(q));
  if (hits.length === 1) return { batch: hits[0] };
  if (hits.length > 1) return { batch: hits[0], candidates: hits.map((b) => b.label) };
  return { error: `No reconciliation matches "${hint}".`, candidates: batches.slice(0, 10).map((b) => b.label) };
}

export async function reconSummary(batchId: string): Promise<ReconSummary> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('get_recon_summary', { p_batch_id: batchId });
  const d = (data ?? {}) as Partial<ReconSummary>;
  return { ...EMPTY_SUMMARY, ...d };
}

export async function reconExceptions(opts: {
  batchId: string;
  status?: ReconStatus;
  side?: 'ours' | 'theirs';
  limit?: number;
  offset?: number;
}): Promise<{ count: number; rows: ReconRow[] }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('get_recon_exceptions', {
    p_batch_id: opts.batchId,
    p_status: opts.status ?? null,
    p_side: opts.side ?? null,
    p_limit: Math.min(Math.max(opts.limit ?? 100, 1), 1000),
    p_offset: Math.max(opts.offset ?? 0, 0),
  });
  const d = (data ?? {}) as { count?: number; rows?: ReconRow[] };
  return { count: d.count ?? 0, rows: d.rows ?? [] };
}
