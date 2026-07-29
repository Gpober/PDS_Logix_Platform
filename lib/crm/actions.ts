'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

// Server actions for the CRM. Every mutation runs under the caller's RLS via the
// request-scoped client, so Postgres enforces who may write what.

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === 'true';
}

// ---- Auth ------------------------------------------------------------------

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

// ---- Clients ---------------------------------------------------------------

export async function createClient(form: FormData) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: str(form, 'name'),
      category: str(form, 'category'),
      website: str(form, 'website'),
      billing_email: str(form, 'billing_email'),
      phone: str(form, 'phone'),
      address: str(form, 'address'),
      notes: str(form, 'notes'),
      is_public: bool(form, 'is_public'),
      qbo_customer_name: str(form, 'qbo_customer_name'),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/crm/clients');
  redirect(`/crm/clients/${data.id}`);
}

export async function updateClient(id: string, form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('clients')
    .update({
      name: str(form, 'name'),
      category: str(form, 'category'),
      website: str(form, 'website'),
      billing_email: str(form, 'billing_email'),
      phone: str(form, 'phone'),
      address: str(form, 'address'),
      notes: str(form, 'notes'),
      is_public: bool(form, 'is_public'),
      qbo_customer_name: str(form, 'qbo_customer_name'),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/clients');
  revalidatePath(`/crm/clients/${id}`);
  redirect(`/crm/clients/${id}`);
}

export async function deleteClient(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/clients');
  redirect('/crm/clients');
}

// ---- Contacts --------------------------------------------------------------

export async function createContact(form: FormData) {
  const supabase = await createServerSupabase();
  const clientId = str(form, 'client_id');
  const { error } = await supabase.from('contacts').insert({
    name: str(form, 'name'),
    email: str(form, 'email'),
    phone: str(form, 'phone'),
    title: str(form, 'title'),
    client_id: clientId,
  });
  if (error) throw new Error(error.message);
  if (clientId) revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath('/crm/contacts');
}

export async function deleteContact(id: string, clientId?: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  if (clientId) revalidatePath(`/crm/clients/${clientId}`);
  revalidatePath('/crm/contacts');
}

// ---- Staff -----------------------------------------------------------------

export async function createStaff(form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('staff').insert({
    name: str(form, 'name'),
    email: str(form, 'email'),
    phone: str(form, 'phone'),
    title: str(form, 'title'),
    is_active: bool(form, 'is_active'),
    notes: str(form, 'notes'),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/crm/staff');
  redirect('/crm/staff');
}

export async function updateStaff(id: string, form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('staff')
    .update({
      name: str(form, 'name'),
      email: str(form, 'email'),
      phone: str(form, 'phone'),
      title: str(form, 'title'),
      is_active: bool(form, 'is_active'),
      notes: str(form, 'notes'),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/staff');
  redirect('/crm/staff');
}

// ---- Assets ----------------------------------------------------------------

export async function createAsset(form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('assets').insert({
    client_id: str(form, 'client_id'),
    asset_type: str(form, 'asset_type') ?? 'vehicle',
    vin: str(form, 'vin'),
    year: num(form, 'year'),
    make: str(form, 'make'),
    model: str(form, 'model'),
    trim: str(form, 'trim'),
    color: str(form, 'color'),
    mileage: num(form, 'mileage'),
    license_plate: str(form, 'license_plate'),
    notes: str(form, 'notes'),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/crm/assets');
  redirect('/crm/assets');
}

export async function updateAsset(id: string, form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('assets')
    .update({
      client_id: str(form, 'client_id'),
      asset_type: str(form, 'asset_type') ?? 'vehicle',
      vin: str(form, 'vin'),
      year: num(form, 'year'),
      make: str(form, 'make'),
      model: str(form, 'model'),
      trim: str(form, 'trim'),
      color: str(form, 'color'),
      mileage: num(form, 'mileage'),
      license_plate: str(form, 'license_plate'),
      notes: str(form, 'notes'),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/assets');
  redirect('/crm/assets');
}

// ---- Jobs ------------------------------------------------------------------

export async function createJob(form: FormData) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      client_id: str(form, 'client_id'),
      asset_id: str(form, 'asset_id'),
      assigned_staff_id: str(form, 'assigned_staff_id'),
      service_type: str(form, 'service_type') ?? 'condition_report',
      status: str(form, 'status') ?? 'requested',
      scheduled_date: str(form, 'scheduled_date'),
      completed_date: str(form, 'completed_date'),
      location: str(form, 'location'),
      notes: str(form, 'notes'),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const price = num(form, 'price');
  const cost = num(form, 'cost');
  if (price !== null || cost !== null) {
    await supabase.from('job_pricing').upsert({ job_id: data.id, price, cost });
  }
  revalidatePath('/crm/jobs');
  redirect(`/crm/jobs/${data.id}`);
}

export async function updateJob(id: string, form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('jobs')
    .update({
      client_id: str(form, 'client_id'),
      asset_id: str(form, 'asset_id'),
      assigned_staff_id: str(form, 'assigned_staff_id'),
      service_type: str(form, 'service_type') ?? 'condition_report',
      status: str(form, 'status') ?? 'requested',
      scheduled_date: str(form, 'scheduled_date'),
      completed_date: str(form, 'completed_date'),
      location: str(form, 'location'),
      notes: str(form, 'notes'),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const price = num(form, 'price');
  const cost = num(form, 'cost');
  if (price !== null || cost !== null) {
    await supabase.from('job_pricing').upsert({ job_id: id, price, cost });
  }
  revalidatePath('/crm/jobs');
  revalidatePath(`/crm/jobs/${id}`);
  redirect(`/crm/jobs/${id}`);
}

// Quick status change from the job detail page.
export async function setJobStatus(id: string, status: string) {
  const supabase = await createServerSupabase();
  const patch: Record<string, unknown> = { status };
  if (status === 'completed') patch.completed_date = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('jobs').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/jobs');
  revalidatePath(`/crm/jobs/${id}`);
}

export async function deleteJob(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('jobs').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/jobs');
  redirect('/crm/jobs');
}

// ---- Time tracking ---------------------------------------------------------

export async function clockIn(form: FormData) {
  const supabase = await createServerSupabase();
  const staffId = str(form, 'staff_id');
  if (!staffId) throw new Error('Pick a staff member to clock in.');
  const { error } = await supabase.from('time_entries').insert({
    staff_id: staffId,
    job_id: str(form, 'job_id'),
  });
  if (error) {
    // The partial unique index blocks a second open entry for the same person.
    if (error.code === '23505') throw new Error('That staff member is already clocked in.');
    throw new Error(error.message);
  }
  revalidatePath('/crm/time');
}

export async function clockOut(entryId: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('time_entries')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', entryId)
    .is('clock_out', null);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/time');
}

export async function deleteTimeEntry(entryId: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('time_entries').delete().eq('id', entryId);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/time');
}

// ---- Leads -----------------------------------------------------------------

export async function deleteLead(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/leads');
  redirect('/crm/leads');
}

// ---- Assistant: team runs & reports ----------------------------------------

// Enqueue a background team run — the Railway worker claims it and works
// Zordon's crew over a business snapshot, writing results back. Owner/admin.
export async function startTeamRun(form: FormData) {
  const brief = str(form, 'scope');
  if (!brief) throw new Error('Give the team a brief.');
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('team_runs').insert({ scope: brief });
  if (error) throw new Error(error.message);
  revalidatePath('/crm/assistant/team');
}

export async function removeTeamRun(form: FormData) {
  const id = str(form, 'id');
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase.from('team_runs').delete().eq('id', id);
  revalidatePath('/crm/assistant/team');
}

export async function deleteAssistantReport(form: FormData) {
  const id = str(form, 'id');
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase.from('assistant_reports').delete().eq('id', id);
  revalidatePath('/crm/assistant/reports');
  redirect('/crm/assistant/reports');
}

export async function forgetMemory(form: FormData) {
  const id = str(form, 'id');
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase.from('assistant_memory').delete().eq('id', id);
  revalidatePath('/crm/assistant/memory');
}

// ---- Production goals -------------------------------------------------------
// Upsert a monthly unit target. location blank = company-wide; period blank
// (YYYY-MM) = the default that applies to every month unless a month-specific
// goal overrides it.
export async function setProductionGoal(form: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  const location = str(form, 'location');
  const period = str(form, 'period');
  const target = num(form, 'target_units');
  if (target === null || target < 0) return;
  // Find an existing goal for this exact scope (null-aware), then update or insert.
  let sel = supabase.from('production_goals').select('id');
  sel = location === null ? sel.is('location', null) : sel.eq('location', location);
  sel = period === null ? sel.is('period', null) : sel.eq('period', period);
  const { data: existing } = await sel.maybeSingle();
  const payload = { location, period, target_units: Math.trunc(target), updated_at: new Date().toISOString() };
  if ((existing as { id: string } | null)?.id) {
    await supabase.from('production_goals').update(payload).eq('id', (existing as { id: string }).id);
  } else {
    await supabase.from('production_goals').insert(payload);
  }
  revalidatePath('/crm/production');
}

export async function deleteProductionGoal(form: FormData): Promise<void> {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (id) await supabase.from('production_goals').delete().eq('id', id);
  revalidatePath('/crm/production');
}
