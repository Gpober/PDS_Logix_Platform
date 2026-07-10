import { createServerSupabase } from '@/lib/supabase/server';
import {
  assetLabel,
  type Asset,
  type Client,
  type Contact,
  type ConditionReport,
  type Job,
  type JobPricing,
  type JobStatus,
  type JobWithRelations,
  type Lead,
  type Profile,
  type Staff,
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
