import { createServerSupabase } from '@/lib/supabase/server';
import {
  assetLabel,
  SERVICE_LABELS,
  type Asset,
  type AssistantDraft,
  type AssistantMemory,
  type AssistantReport,
  type Client,
  type Contact,
  type ConditionReport,
  type DraftKind,
  type Job,
  type JobPricing,
  type JobStatus,
  type JobWithRelations,
  type Lead,
  type MemoryCategory,
  type Profile,
  type ReportBlock,
  type ServiceType,
  type Staff,
  type TeamRun,
  type TimeEntryWithRelations,
} from './types';

// All reads use the request-scoped server client, so RLS runs as the logged-in
// user. Owner/admin/member all get full read access to the CRM.

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('id', user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

// ---- Clients ---------------------------------------------------------------

export async function listClients(search?: string): Promise<Client[]> {
  const supabase = await createServerSupabase();
  let q = supabase.from('clients').select('*').order('name');
  if (search?.trim()) q = q.ilike('name', `%${search.trim()}%`);
  const { data } = await q;
  return (data as Client[]) ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  return (data as Client) ?? null;
}

export async function getClientContacts(clientId: string): Promise<Contact[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('client_id', clientId)
    .order('name');
  return (data as Contact[]) ?? [];
}

export async function getClientAssets(clientId: string): Promise<Asset[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assets')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return (data as Asset[]) ?? [];
}

// Lightweight {id, name} options for select menus.
export async function clientOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('clients').select('id, name').order('name');
  return (data as { id: string; name: string }[]) ?? [];
}

// ---- Contacts --------------------------------------------------------------

export async function listContacts(): Promise<(Contact & { client_name: string | null })[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('contacts')
    .select('*, clients(name)')
    .order('name');
  return ((data as (Contact & { clients: { name: string } | null })[]) ?? []).map((c) => ({
    ...c,
    client_name: c.clients?.name ?? null,
  }));
}

// ---- Staff -----------------------------------------------------------------

export async function listStaff(): Promise<Staff[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('staff').select('*').order('name');
  return (data as Staff[]) ?? [];
}

export async function getStaff(id: string): Promise<Staff | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('staff').select('*').eq('id', id).maybeSingle();
  return (data as Staff) ?? null;
}

export async function staffOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('staff')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  return (data as { id: string; name: string }[]) ?? [];
}

// ---- Assets ----------------------------------------------------------------

export async function listAssets(): Promise<(Asset & { client_name: string | null })[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assets')
    .select('*, clients(name)')
    .order('created_at', { ascending: false });
  return ((data as (Asset & { clients: { name: string } | null })[]) ?? []).map((a) => ({
    ...a,
    client_name: a.clients?.name ?? null,
  }));
}

export async function getAsset(id: string): Promise<Asset | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('assets').select('*').eq('id', id).maybeSingle();
  return (data as Asset) ?? null;
}

export async function assetOptions(): Promise<{ id: string; label: string; client_id: string | null }[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assets')
    .select('id, client_id, year, make, model, vin')
    .order('created_at', { ascending: false });
  return ((data as Asset[]) ?? []).map((a) => ({
    id: a.id,
    client_id: a.client_id,
    label: assetLabel(a),
  }));
}

// ---- Jobs ------------------------------------------------------------------

interface JobRow extends Job {
  clients: { name: string } | null;
  staff: { name: string } | null;
  assets: { year: number | null; make: string | null; model: string | null; vin: string | null } | null;
  job_pricing: { price: number | null; cost: number | null } | null;
}

const JOB_SELECT =
  '*, clients(name), staff(name), assets(year, make, model, vin), job_pricing(price, cost)';

function shapeJob(row: JobRow): JobWithRelations {
  return {
    ...row,
    client_name: row.clients?.name ?? null,
    staff_name: row.staff?.name ?? null,
    asset_label: row.assets ? assetLabel(row.assets) : null,
    price: row.job_pricing?.price ?? null,
    cost: row.job_pricing?.cost ?? null,
  };
}

export async function listJobs(status?: JobStatus): Promise<JobWithRelations[]> {
  const supabase = await createServerSupabase();
  let q = supabase.from('jobs').select(JOB_SELECT).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return ((data as JobRow[]) ?? []).map(shapeJob);
}

export async function getJob(id: string): Promise<JobWithRelations | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle();
  return data ? shapeJob(data as JobRow) : null;
}

export async function getJobPricing(jobId: string): Promise<JobPricing | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('job_pricing')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  return (data as JobPricing) ?? null;
}

export async function getConditionReport(jobId: string): Promise<ConditionReport | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('condition_reports')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  return (data as ConditionReport) ?? null;
}

// ---- Leads -----------------------------------------------------------------

export async function listLeads(): Promise<Lead[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Lead[]) ?? [];
}

export async function getLead(id: string): Promise<Lead | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
  return (data as Lead) ?? null;
}

// ---- Time tracking ---------------------------------------------------------

interface TimeEntryRow {
  id: string;
  staff_id: string;
  job_id: string | null;
  clock_in: string;
  clock_out: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  staff: { name: string } | null;
  jobs: { service_type: ServiceType; clients: { name: string } | null } | null;
}

function shapeEntry(row: TimeEntryRow): TimeEntryWithRelations {
  const jobLabel = row.jobs
    ? [SERVICE_LABELS[row.jobs.service_type], row.jobs.clients?.name].filter(Boolean).join(' · ')
    : null;
  const duration = row.clock_out
    ? new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()
    : null;
  return {
    id: row.id,
    staff_id: row.staff_id,
    job_id: row.job_id,
    clock_in: row.clock_in,
    clock_out: row.clock_out,
    clock_in_lat: row.clock_in_lat,
    clock_in_lng: row.clock_in_lng,
    clock_out_lat: row.clock_out_lat,
    clock_out_lng: row.clock_out_lng,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    staff_name: row.staff?.name ?? null,
    job_label: jobLabel,
    duration_ms: duration,
  };
}

const TIME_SELECT = '*, staff(name), jobs(service_type, clients(name))';

// Everyone currently clocked in (no clock_out), oldest first.
export async function getOpenTimeEntries(): Promise<TimeEntryWithRelations[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('time_entries')
    .select(TIME_SELECT)
    .is('clock_out', null)
    .order('clock_in', { ascending: true });
  return ((data as TimeEntryRow[]) ?? []).map(shapeEntry);
}

export async function getRecentTimeEntries(limit = 100): Promise<TimeEntryWithRelations[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('time_entries')
    .select(TIME_SELECT)
    .order('clock_in', { ascending: false })
    .limit(limit);
  return ((data as TimeEntryRow[]) ?? []).map(shapeEntry);
}

// ---- Dashboard -------------------------------------------------------------

export interface DashboardStats {
  clients: number;
  assets: number;
  staff: number;
  openJobs: number;
  leads: number;
  jobsByStatus: Record<JobStatus, number>;
  pipelineValue: number; // sum of price on non-invoiced jobs
  invoicedValue: number; // sum of price on invoiced jobs
}

async function count(table: string): Promise<number> {
  const supabase = await createServerSupabase();
  const { count: c } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return c ?? 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [clients, assets, staff, leads, jobs] = await Promise.all([
    count('clients'),
    count('assets'),
    count('staff'),
    count('leads'),
    listJobs(),
  ]);

  const jobsByStatus: Record<JobStatus, number> = {
    requested: 0,
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    invoiced: 0,
  };
  let pipelineValue = 0;
  let invoicedValue = 0;
  for (const j of jobs) {
    jobsByStatus[j.status] = (jobsByStatus[j.status] ?? 0) + 1;
    const price = Number(j.price ?? 0);
    if (j.status === 'invoiced') invoicedValue += price;
    else pipelineValue += price;
  }
  const openJobs = jobs.length - jobsByStatus.invoiced;

  return { clients, assets, staff, leads, openJobs, jobsByStatus, pipelineValue, invoicedValue };
}

export async function recentJobs(limit = 8): Promise<JobWithRelations[]> {
  const jobs = await listJobs();
  return jobs.slice(0, limit);
}

// ---- Analytics (for Zordon + the specialist crew) --------------------------

export interface ClientPerformanceRow {
  client: string;
  jobs: number;
  completed: number;
  pipeline_value: number;
  invoiced_value: number;
  total_value: number;
}

// Per-client ranking: job counts and dollar totals, biggest book of business
// first. Pipeline = not-yet-invoiced price; invoiced = billed price.
export async function clientPerformance(): Promise<ClientPerformanceRow[]> {
  const jobs = await listJobs();
  const byClient = new Map<string, ClientPerformanceRow>();
  for (const j of jobs) {
    const name = j.client_name ?? 'Unknown';
    const row =
      byClient.get(name) ??
      { client: name, jobs: 0, completed: 0, pipeline_value: 0, invoiced_value: 0, total_value: 0 };
    row.jobs += 1;
    if (j.status === 'completed' || j.status === 'invoiced') row.completed += 1;
    const price = Number(j.price ?? 0);
    if (j.status === 'invoiced') row.invoiced_value += price;
    else row.pipeline_value += price;
    row.total_value += price;
    byClient.set(name, row);
  }
  return [...byClient.values()].sort((a, b) => b.total_value - a.total_value);
}

export interface JobAnalytics {
  total_jobs: number;
  by_status: Record<JobStatus, number>;
  by_service_type: Record<string, number>;
  pipeline_value: number;
  invoiced_value: number;
  total_margin: number; // sum of (price - cost)
  avg_margin: number;
  completed_not_invoiced: { id: string; client: string | null; service_type: string; price: number | null }[];
}

// A deeper operational rollup than the dashboard: status + service-type mix,
// margin, and the jobs that are done but not yet invoiced (money on the table).
export async function jobAnalytics(): Promise<JobAnalytics> {
  const jobs = await listJobs();
  const by_status: Record<JobStatus, number> = {
    requested: 0,
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    invoiced: 0,
  };
  const by_service_type: Record<string, number> = {};
  let pipeline_value = 0;
  let invoiced_value = 0;
  let total_margin = 0;
  let marginCount = 0;
  const completed_not_invoiced: JobAnalytics['completed_not_invoiced'] = [];

  for (const j of jobs) {
    by_status[j.status] = (by_status[j.status] ?? 0) + 1;
    by_service_type[j.service_type] = (by_service_type[j.service_type] ?? 0) + 1;
    const price = Number(j.price ?? 0);
    if (j.status === 'invoiced') invoiced_value += price;
    else pipeline_value += price;
    if (j.price != null && j.cost != null) {
      total_margin += Number(j.price) - Number(j.cost);
      marginCount += 1;
    }
    if (j.status === 'completed') {
      completed_not_invoiced.push({ id: j.id, client: j.client_name, service_type: j.service_type, price: j.price });
    }
  }

  return {
    total_jobs: jobs.length,
    by_status,
    by_service_type,
    pipeline_value,
    invoiced_value,
    total_margin,
    avg_margin: marginCount ? Math.round((total_margin / marginCount) * 100) / 100 : 0,
    completed_not_invoiced,
  };
}

// ---- Assistant: drafts -----------------------------------------------------
// Draft-only outreach. Owner/admin under RLS. Nothing sends from here.

export async function listAssistantDrafts(): Promise<AssistantDraft[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assistant_drafts')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as AssistantDraft[]) ?? [];
}

export interface NewAssistantDraft {
  kind: DraftKind;
  subject: string;
  body: string;
  to_name?: string | null;
  to_email?: string | null;
  lead_id?: string | null;
  client_id?: string | null;
}

export async function createAssistantDraft(
  draft: NewAssistantDraft,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('assistant_drafts')
    .insert({
      kind: draft.kind,
      subject: draft.subject,
      body: draft.body,
      to_name: draft.to_name ?? null,
      to_email: draft.to_email ?? null,
      lead_id: draft.lead_id ?? null,
      client_id: draft.client_id ?? null,
    })
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

// ---- Assistant: memory -----------------------------------------------------
// Durable facts loaded into Zordon's prompt; added via her `remember` tool.

export async function listAssistantMemories(): Promise<AssistantMemory[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assistant_memory')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as AssistantMemory[]) ?? [];
}

export interface NewAssistantMemory {
  content: string;
  category?: MemoryCategory;
  subject?: string | null;
  client_id?: string | null;
}

export async function createAssistantMemory(
  memory: NewAssistantMemory,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('assistant_memory')
    .insert({
      content: memory.content,
      category: memory.category ?? 'general',
      subject: memory.subject ?? null,
      client_id: memory.client_id ?? null,
    })
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

export async function deleteAssistantMemory(id: string): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from('assistant_memory').delete().eq('id', id);
}

// ---- Assistant: visual reports ---------------------------------------------

export async function listAssistantReports(limit = 30): Promise<AssistantReport[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assistant_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as AssistantReport[]) ?? [];
}

export async function getAssistantReport(id: string): Promise<AssistantReport | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('assistant_reports').select('*').eq('id', id).maybeSingle();
  return (data as AssistantReport) ?? null;
}

export async function createAssistantReport(report: {
  title: string;
  summary?: string | null;
  blocks: ReportBlock[];
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('assistant_reports')
    .insert({ title: report.title, summary: report.summary ?? null, blocks: report.blocks })
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

// ---- Assistant: team runs (queue read side; the worker writes results) -----

export async function listTeamRuns(limit = 20): Promise<TeamRun[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('team_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as TeamRun[]) ?? [];
}

export async function getTeamRun(id: string): Promise<TeamRun | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('team_runs').select('*').eq('id', id).maybeSingle();
  return (data as TeamRun) ?? null;
}

export async function enqueueTeamRun(scope: string): Promise<{ id: string } | { error: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('team_runs')
    .insert({ scope })
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

// ---- Production (Connecteam unit log) --------------------------------------
// Aggregates production_entries via the get_production_summary RPC: total units,
// and breakdowns by location, service type, person, month, and day. Optional
// location / date scope.
export interface ProductionSummary {
  total_units: number;
  date_from: string | null;
  date_to: string | null;
  locations: { location: string; units: number }[];
  by_service: { service_type: string; units: number }[];
  by_staff: { staff: string; units: number }[];
  by_month: { month: string; units: number }[];
  by_day: { day: string; units: number }[];
}

export async function productionSummary(opts?: { location?: string; from?: string; to?: string }): Promise<ProductionSummary> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('get_production_summary', {
    p_location: opts?.location ?? null,
    p_from: opts?.from ?? null,
    p_to: opts?.to ?? null,
  });
  const d = (data ?? {}) as Partial<ProductionSummary>;
  return {
    total_units: d.total_units ?? 0,
    date_from: d.date_from ?? null,
    date_to: d.date_to ?? null,
    locations: d.locations ?? [],
    by_service: d.by_service ?? [],
    by_staff: d.by_staff ?? [],
    by_month: d.by_month ?? [],
    by_day: d.by_day ?? [],
  };
}

// ---- Production goals -------------------------------------------------------
export interface ProductionGoal {
  id: string;
  location: string | null;   // null = company-wide (all locations)
  staff_name: string | null; // set = a personal target for one worker
  period: string | null;     // 'YYYY-MM' or null = default monthly target
  target_units: number;
  note: string | null;
  created_at: string;
}

export async function getProductionGoals(): Promise<ProductionGoal[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('production_goals').select('*').order('location').order('period');
  return (data ?? []) as ProductionGoal[];
}

// The unit target for a location + month, most-specific first:
// (loc, month) > (loc, default) > (company, month) > (company, default).
export async function resolveMonthlyGoal(location: string | null, month: string): Promise<number> {
  const goals = await getProductionGoals();
  const pick = (loc: string | null, per: string | null) =>
    goals.find((g) => (g.location ?? null) === loc && (g.period ?? null) === per)?.target_units;
  return pick(location, month) ?? pick(location, null) ?? pick(null, month) ?? pick(null, null) ?? 0;
}

// ---- Worker portal: identity + scoped reads --------------------------------
// Resolve the logged-in user to their staff row by email (no FK link exists).
export async function getMyStaff(): Promise<Staff | null> {
  const profile = await getCurrentProfile();
  if (!profile?.email) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('staff')
    .select('*')
    .ilike('email', profile.email)
    .maybeSingle();
  return (data as Staff) ?? null;
}

export async function myOpenTimeEntry(staffId: string): Promise<TimeEntryWithRelations | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('time_entries').select(TIME_SELECT).eq('staff_id', staffId).is('clock_out', null).order('clock_in', { ascending: true }).limit(1).maybeSingle();
  return data ? shapeEntry(data as TimeEntryRow) : null;
}

export async function myRecentTime(staffId: string, limit = 30): Promise<TimeEntryWithRelations[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('time_entries').select(TIME_SELECT).eq('staff_id', staffId).order('clock_in', { ascending: false }).limit(limit);
  return ((data ?? []) as TimeEntryRow[]).map(shapeEntry);
}

// Unpaid meal break: 1 hour is deducted from any single shift of 8+ hours.
// Applied per shift, everywhere hours feed pay, so the portal, the owner report,
// and the RPC all agree.
export const BREAK_MIN_SHIFT_HOURS = 8;
export const BREAK_DEDUCT_HOURS = 1;
const MS_HOUR = 3_600_000;

// Paid milliseconds for one shift, after the meal-break deduction.
export function paidShiftMs(clockIn: string, clockOut: string): number {
  const raw = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  if (raw <= 0) return 0;
  return raw >= BREAK_MIN_SHIFT_HOURS * MS_HOUR ? Math.max(0, raw - BREAK_DEDUCT_HOURS * MS_HOUR) : raw;
}

// Sum PAID milliseconds for a staff member since a date (completed shifts only,
// meal break deducted).
export async function myHoursSince(staffId: string, sinceIso: string): Promise<number> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('time_entries').select('clock_in, clock_out').eq('staff_id', staffId).gte('clock_in', sinceIso).not('clock_out', 'is', null);
  let ms = 0;
  for (const r of (data ?? []) as { clock_in: string; clock_out: string }[]) ms += paidShiftMs(r.clock_in, r.clock_out);
  return ms;
}

export interface WorkerProduction {
  total_units: number;
  date_from: string | null;
  date_to: string | null;
  by_service: { service_type: string; units: number }[];
  by_location: { location: string; units: number }[];
  by_month: { month: string; units: number }[];
  by_day: { day: string; units: number }[];
}

export async function workerProduction(staffName: string, from?: string, to?: string): Promise<WorkerProduction> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('get_worker_production', { p_staff: staffName, p_from: from ?? null, p_to: to ?? null });
  const d = (data ?? {}) as Partial<WorkerProduction>;
  return {
    total_units: d.total_units ?? 0,
    date_from: d.date_from ?? null,
    date_to: d.date_to ?? null,
    by_service: d.by_service ?? [],
    by_location: d.by_location ?? [],
    by_month: d.by_month ?? [],
    by_day: d.by_day ?? [],
  };
}

// A worker's monthly unit target: (staff, month) > (staff, default).
export async function resolveWorkerGoal(staffName: string, month: string): Promise<number> {
  const goals = await getProductionGoals();
  const pick = (per: string | null) => goals.find((g) => (g.staff_name ?? null) === staffName && (g.period ?? null) === per)?.target_units;
  return pick(month) ?? pick(null) ?? 0;
}

export interface WorkerEntry {
  id: string;
  location: string;
  service_type: string | null;
  submitted_at: string | null;
  vehicle_year: number | null;
  vin_last6: string | null;
  model_type: string | null;
  note: string | null;
  photo_url: string | null;
  source: string;
}

// A worker's own recently-logged vehicles (native platform entries first-class,
// but historical Connecteam rows show too). Scoped by staff_id.
export async function myRecentEntries(staffId: string, limit = 20): Promise<WorkerEntry[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('production_entries')
    .select('id, location, service_type, submitted_at, vehicle_year, vin_last6, model_type, note, photo_url, source')
    .eq('staff_id', staffId)
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as WorkerEntry[];
}

// A worker's pace against their monthly unit goal — the numbers the portal home
// and performance pages show. Same shape the worker-Zordon my_goal tool returns.
export interface WorkerPace {
  month: string;
  target: number;
  done: number;
  remaining: number;
  daysInMonth: number;
  daysElapsed: number;
  daysLeft: number;
  perDayNeeded: number;
  paceSoFar: number;
  projected: number;
  onTrack: boolean | null;
}

export async function workerMonthPace(staffName: string, month: string, todayIso: string): Promise<WorkerPace> {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const isCurrent = month === todayIso.slice(0, 7);
  const daysElapsed = isCurrent ? Number(todayIso.slice(8, 10)) : daysInMonth;
  const daysLeft = Math.max(0, daysInMonth - daysElapsed);
  const start = `${month}-01`;
  const end = isCurrent ? todayIso : `${month}-${p2(daysInMonth)}`;
  const [target, prod] = await Promise.all([
    resolveWorkerGoal(staffName, month),
    workerProduction(staffName, start, end),
  ]);
  const done = prod.total_units;
  const remaining = Math.max(0, target - done);
  const perDayNeeded = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  const paceSoFar = daysElapsed > 0 ? done / daysElapsed : 0;
  const projected = Math.round(paceSoFar * daysInMonth);
  return {
    month,
    target,
    done,
    remaining,
    daysInMonth,
    daysElapsed,
    daysLeft,
    perDayNeeded,
    paceSoFar: Math.round(paceSoFar * 10) / 10,
    projected,
    onTrack: target > 0 ? projected >= target : null,
  };
}

// ---- Pay --------------------------------------------------------------------
// PDS pays hourly base + per-unit piece rate, summed over a pay period.
export interface WorkerPay {
  from: string;
  to: string;
  hours: number;
  units: number;
  hourlyRate: number;
  unitRate: number;
  hourlyPay: number;
  unitPay: number;
  salaryPay: number; // flat per-check salary applied to this period
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const nextDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

// One worker's pay for [from, to] (inclusive). Scoped to their own rows.
export async function workerPay(staff: Staff, from: string, to: string): Promise<WorkerPay> {
  const supabase = await createServerSupabase();
  const upper = nextDay(to);
  const [{ data: shifts }, { count }] = await Promise.all([
    supabase.from('time_entries').select('clock_in, clock_out').eq('staff_id', staff.id).gte('clock_in', from).lt('clock_in', upper).not('clock_out', 'is', null),
    supabase.from('production_entries').select('*', { count: 'exact', head: true }).eq('staff_id', staff.id).gte('submitted_at', from).lt('submitted_at', upper),
  ]);
  let ms = 0;
  for (const r of (shifts ?? []) as { clock_in: string; clock_out: string }[]) ms += paidShiftMs(r.clock_in, r.clock_out);
  const hours = round2(ms / 3_600_000);
  const units = count ?? 0;
  const hourlyRate = staff.hourly_rate ?? 0;
  const unitRate = staff.unit_rate ?? 0;
  const hourlyPay = round2(hours * hourlyRate);
  const unitPay = round2(units * unitRate);
  const salaryPay = staff.salary_per_check ?? 0;
  return { from, to, hours, units, hourlyRate, unitRate, hourlyPay, unitPay, salaryPay, total: round2(hourlyPay + unitPay + salaryPay) };
}

// The shifts and units behind a worker's pay for a period — the drill-down.
export interface PayShiftRow {
  clock_in: string;
  clock_out: string;
  rawHours: number;
  breakHours: number;
  paidHours: number;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
}
export interface PayDetail {
  shifts: PayShiftRow[];
  entries: WorkerEntry[];
  paidHours: number;
  units: number;
}

export async function payDetail(staffId: string, from: string, to: string): Promise<PayDetail> {
  const supabase = await createServerSupabase();
  const upper = nextDay(to);
  const [{ data: te }, { data: pe }] = await Promise.all([
    supabase.from('time_entries')
      .select('clock_in, clock_out, clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng')
      .eq('staff_id', staffId).gte('clock_in', from).lt('clock_in', upper).not('clock_out', 'is', null)
      .order('clock_in', { ascending: true }),
    supabase.from('production_entries')
      .select('id, location, service_type, submitted_at, vehicle_year, vin_last6, model_type, note, photo_url, source')
      .eq('staff_id', staffId).gte('submitted_at', from).lt('submitted_at', upper)
      .order('submitted_at', { ascending: true }),
  ]);
  const shifts: PayShiftRow[] = ((te ?? []) as Array<{ clock_in: string; clock_out: string; clock_in_lat: number | null; clock_in_lng: number | null; clock_out_lat: number | null; clock_out_lng: number | null }>).map((r) => {
    const rawHours = Math.round(((new Date(r.clock_out).getTime() - new Date(r.clock_in).getTime()) / MS_HOUR) * 100) / 100;
    const paidHours = Math.round((paidShiftMs(r.clock_in, r.clock_out) / MS_HOUR) * 100) / 100;
    return { clock_in: r.clock_in, clock_out: r.clock_out, rawHours, breakHours: Math.round((rawHours - paidHours) * 100) / 100, paidHours, clock_in_lat: r.clock_in_lat, clock_in_lng: r.clock_in_lng, clock_out_lat: r.clock_out_lat, clock_out_lng: r.clock_out_lng };
  });
  const entries = (pe ?? []) as WorkerEntry[];
  const paidHours = round2(shifts.reduce((a, s) => a + s.paidHours, 0));
  return { shifts, entries, paidHours, units: entries.length };
}

export interface PayRosterRow {
  staff_id: string;
  name: string;
  title: string | null;
  is_active: boolean;
  payroll_group: 'A' | 'B';
  email: string | null;
  hourly_rate: number | null;
  unit_rate: number | null;
  salary_per_check: number | null;
  hours: number;
  units: number;
  hourlyPay: number;
  unitPay: number;
  salaryPay: number;
  total: number;
}

// Every active worker's hours, units, and pay for [from, to] — the owner report.
// Optionally scope to one pay group (A/B), since each group's period differs.
export async function payRoster(from: string, to: string, group?: 'A' | 'B'): Promise<PayRosterRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('get_pay_roster', { p_from: from, p_to: to });
  let rows = (data ?? []) as Array<Omit<PayRosterRow, 'hourlyPay' | 'unitPay' | 'salaryPay' | 'total'>>;
  if (group) rows = rows.filter((r) => (r.payroll_group ?? 'A') === group);
  return rows.map((r) => {
    const hourlyPay = round2(r.hours * (r.hourly_rate ?? 0));
    const unitPay = round2(r.units * (r.unit_rate ?? 0));
    const salaryPay = r.salary_per_check ?? 0;
    return { ...r, hourlyPay, unitPay, salaryPay, total: round2(hourlyPay + unitPay + salaryPay) };
  });
}

export async function recentLocations(limit = 8): Promise<string[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('production_entries').select('location').limit(2000);
  const set = new Set<string>();
  for (const r of (data ?? []) as { location: string }[]) if (r.location) set.add(r.location);
  return [...set].sort().slice(0, limit);
}
