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

// ---- Leads -----------------------------------------------------------------

export async function deleteLead(id: string) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/crm/leads');
  redirect('/crm/leads');
}
