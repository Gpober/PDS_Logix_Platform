'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Finding, JobStatus, Photo, ServiceType } from './types';

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}

function num(form: FormData, key: string): number | null {
  const s = str(form, key);
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : n;
}

async function isOwner(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('is_owner');
  return data === true;
}

// ---- Auth ---------------------------------------------------------------
export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

// ---- Clients ------------------------------------------------------------
export async function saveClient(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const payload = {
    name: str(form, 'name') ?? '',
    category: str(form, 'category'),
    website: str(form, 'website'),
    billing_email: str(form, 'billing_email'),
    phone: str(form, 'phone'),
    address: str(form, 'address'),
    notes: str(form, 'notes'),
  };
  if (id) await supabase.from('clients').update(payload).eq('id', id);
  else await supabase.from('clients').insert(payload);
  revalidatePath('/crm/clients');
  redirect('/crm/clients');
}

// ---- Contacts -----------------------------------------------------------
export async function saveContact(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const payload = {
    name: str(form, 'name') ?? '',
    email: str(form, 'email'),
    phone: str(form, 'phone'),
    title: str(form, 'title'),
    client_id: str(form, 'client_id'),
  };
  if (id) await supabase.from('contacts').update(payload).eq('id', id);
  else await supabase.from('contacts').insert(payload);
  revalidatePath('/crm/contacts');
  redirect('/crm/contacts');
}

// ---- Staff --------------------------------------------------------------
export async function saveStaff(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const payload = {
    name: str(form, 'name') ?? '',
    email: str(form, 'email'),
    phone: str(form, 'phone'),
    title: str(form, 'title'),
    is_active: form.get('is_active') === 'on' || form.get('is_active') === 'true',
    notes: str(form, 'notes'),
  };
  if (id) await supabase.from('staff').update(payload).eq('id', id);
  else await supabase.from('staff').insert(payload);
  revalidatePath('/crm/staff');
  redirect('/crm/staff');
}

// ---- Assets -------------------------------------------------------------
export async function saveAsset(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const payload = {
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
  };
  if (id) await supabase.from('assets').update(payload).eq('id', id);
  else await supabase.from('assets').insert(payload);
  revalidatePath('/crm/assets');
  redirect('/crm/assets');
}

// ---- Jobs + pricing -----------------------------------------------------
export async function saveJob(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const payload = {
    client_id: str(form, 'client_id'),
    asset_id: str(form, 'asset_id'),
    assigned_staff_id: str(form, 'assigned_staff_id'),
    service_type: (str(form, 'service_type') ?? 'condition_report') as ServiceType,
    status: (str(form, 'status') ?? 'requested') as JobStatus,
    scheduled_date: str(form, 'scheduled_date'),
    completed_date: str(form, 'completed_date'),
    location: str(form, 'location'),
    notes: str(form, 'notes'),
  };

  let jobId = id;
  if (id) {
    await supabase.from('jobs').update(payload).eq('id', id);
  } else {
    const { data } = await supabase.from('jobs').insert(payload).select('id').single();
    jobId = (data as { id: string } | null)?.id ?? null;
  }

  // Pricing writes go to job_pricing — only attempted for owner/admin; RLS would
  // reject a member anyway. Empty price+cost clears any existing row.
  if (jobId && (await isOwner())) {
    const price = num(form, 'price');
    const cost = num(form, 'cost');
    if (price === null && cost === null) {
      await supabase.from('job_pricing').delete().eq('job_id', jobId);
    } else {
      await supabase
        .from('job_pricing')
        .upsert({ job_id: jobId, price, cost }, { onConflict: 'job_id' });
    }
  }

  revalidatePath('/crm/jobs');
  redirect('/crm/jobs');
}

// ---- Condition reports --------------------------------------------------
// findings/photos arrive as JSON strings from the client editor.
function parseFindings(raw: string | null): Finding[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((f): Finding => ({
        area: String(f.area ?? '').trim(),
        severity: String(f.severity ?? 'minor'),
        description: String(f.description ?? '').trim(),
        cost_estimate:
          f.cost_estimate === null || f.cost_estimate === '' || f.cost_estimate === undefined
            ? null
            : Number(f.cost_estimate) || null,
      }))
      .filter((f) => f.area || f.description);
  } catch {
    return [];
  }
}

function parsePhotos(raw: string | null): Photo[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p): Photo => ({ url: String(p.url ?? '').trim(), label: String(p.label ?? '').trim() }))
      .filter((p) => p.url);
  } catch {
    return [];
  }
}

export async function saveConditionReport(form: FormData) {
  const supabase = await createServerSupabase();
  const jobId = str(form, 'job_id');
  if (!jobId) redirect('/crm/jobs');

  const payload = {
    job_id: jobId,
    asset_id: str(form, 'asset_id'),
    overall_grade: str(form, 'overall_grade'),
    mileage: num(form, 'mileage'),
    exterior_notes: str(form, 'exterior_notes'),
    interior_notes: str(form, 'interior_notes'),
    mechanical_notes: str(form, 'mechanical_notes'),
    findings: parseFindings(str(form, 'findings_json')),
    photos: parsePhotos(str(form, 'photos_json')),
    inspected_by: str(form, 'inspected_by'),
    inspected_at: str(form, 'inspected_at'),
  };

  await supabase.from('condition_reports').upsert(payload, { onConflict: 'job_id' });

  revalidatePath(`/crm/jobs/${jobId}`);
  revalidatePath('/crm/reports');
  redirect(`/crm/jobs/${jobId}`);
}
