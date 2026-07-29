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
  location: string | null; // null = company-wide (all locations)
  period: string | null;   // 'YYYY-MM' or null = default monthly target
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
