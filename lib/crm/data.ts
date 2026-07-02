import { createServerSupabase } from '@/lib/supabase/server';
import type {
  Asset,
  Client,
  ClientOverview,
  Contact,
  JobWithPricing,
  Lead,
  Profile,
  Staff,
} from './types';

// All reads use the request-scoped server client, so RLS runs as the logged-in
// user — price/cost come back NULL for members straight from Postgres.

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

// ---- Clients ------------------------------------------------------------
export async function listClients(): Promise<ClientOverview[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('client_overview').select('*').order('name');
  return (data as ClientOverview[]) ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  return (data as Client) ?? null;
}

export async function clientOptions(): Promise<Pick<Client, 'id' | 'name'>[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('clients').select('id, name').order('name');
  return (data as Pick<Client, 'id' | 'name'>[]) ?? [];
}

// ---- Contacts -----------------------------------------------------------
export async function listContacts(): Promise<Contact[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('contacts').select('*').order('name');
  return (data as Contact[]) ?? [];
}

export async function listContactsForClient(clientId: string): Promise<Contact[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('contacts')
    .select('*')
    .eq('client_id', clientId)
    .order('name');
  return (data as Contact[]) ?? [];
}

// ---- Staff --------------------------------------------------------------
export async function listStaff(): Promise<Staff[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('staff').select('*').order('name');
  return (data as Staff[]) ?? [];
}

export async function staffOptions(): Promise<Pick<Staff, 'id' | 'name'>[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('staff')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  return (data as Pick<Staff, 'id' | 'name'>[]) ?? [];
}

// ---- Assets -------------------------------------------------------------
export async function listAssets(): Promise<Asset[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Asset[]) ?? [];
}

export async function assetOptions(): Promise<Asset[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Asset[]) ?? [];
}

// ---- Jobs ---------------------------------------------------------------
export interface JobListRow extends JobWithPricing {
  client_name: string;
  staff_name: string | null;
  vehicle: string;
}

export async function listJobs(): Promise<JobListRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('jobs_with_pricing')
    .select('*')
    .order('scheduled_date', { ascending: false, nullsFirst: false });
  const rows = (data as JobWithPricing[]) ?? [];
  return hydrateJobs(rows);
}

async function hydrateJobs(rows: JobWithPricing[]): Promise<JobListRow[]> {
  if (rows.length === 0) return [];
  const supabase = await createServerSupabase();
  const clientIds = [...new Set(rows.map((r) => r.client_id))];
  const staffIds = [...new Set(rows.map((r) => r.assigned_staff_id).filter(Boolean))] as string[];
  const assetIds = [...new Set(rows.map((r) => r.asset_id).filter(Boolean))] as string[];
  const [{ data: clients }, { data: staff }, { data: assets }] = await Promise.all([
    supabase.from('clients').select('id, name').in('id', clientIds),
    staffIds.length
      ? supabase.from('staff').select('id, name').in('id', staffIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    assetIds.length
      ? supabase.from('assets').select('id, year, make, model').in('id', assetIds)
      : Promise.resolve({ data: [] as { id: string; year: number | null; make: string | null; model: string | null }[] }),
  ]);
  const cMap = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const sMap = new Map((staff ?? []).map((s) => [s.id, s.name]));
  const aMap = new Map(
    (assets ?? []).map((a) => [
      a.id,
      [a.year, a.make, a.model].filter(Boolean).join(' ') || 'Vehicle',
    ]),
  );
  return rows.map((r) => ({
    ...r,
    client_name: cMap.get(r.client_id) ?? 'Unknown',
    staff_name: r.assigned_staff_id ? sMap.get(r.assigned_staff_id) ?? null : null,
    vehicle: r.asset_id ? aMap.get(r.asset_id) ?? '—' : '—',
  }));
}

// ---- Leads --------------------------------------------------------------
export async function listLeads(): Promise<Lead[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as Lead[]) ?? [];
}

// ---- Dashboard ----------------------------------------------------------
export interface DashboardStats {
  clients: number;
  openJobs: number;
  activeStaff: number;
  newLeads: number;
}

export async function dashboardStats(): Promise<DashboardStats> {
  const supabase = await createServerSupabase();
  const [clients, openJobs, staff, leads] = await Promise.all([
    supabase.from('clients').select('id', { count: 'exact', head: true }),
    supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(completed,invoiced)'),
    supabase.from('staff').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('leads').select('id', { count: 'exact', head: true }),
  ]);
  return {
    clients: clients.count ?? 0,
    openJobs: openJobs.count ?? 0,
    activeStaff: staff.count ?? 0,
    newLeads: leads.count ?? 0,
  };
}
