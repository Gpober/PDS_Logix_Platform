'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { createInvoice, getInvoices } from '@/lib/integrations/iamcfo';
import { assetLabel, SERVICE_LABELS, type ServiceType } from './types';

// Push a job's invoice to QuickBooks and pull status back — but PDS's books live
// in the I AM CFO platform (org "PDS Logix" / Pride Dealer Services), so every
// call goes through the I AM CFO partner API, not a direct Intuit connection.
// Manual, team-triggered. Each runs under the caller's RLS.

interface JobForInvoice {
  id: string;
  service_type: ServiceType;
  qbo_invoice_id: string | null;
  clients: { id: string; name: string; qbo_customer_name: string | null } | null;
  assets: { year: number | null; make: string | null; model: string | null; vin: string | null } | null;
  job_pricing: { price: number | null } | null;
}

function statusFor(total: number, balance: number): string {
  if (balance <= 0) return 'paid';
  if (balance < total) return 'partial';
  return 'unpaid';
}

export async function sendJobToQuickBooks(jobId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('jobs')
    .select('id, service_type, qbo_invoice_id, clients(id, name, qbo_customer_name), assets(year, make, model, vin), job_pricing(price)')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const job = data as JobForInvoice | null;
  if (!job) throw new Error('Job not found.');
  if (job.qbo_invoice_id) throw new Error('This job already has a QuickBooks invoice.');
  if (!job.clients) throw new Error('Add a client to this job before invoicing.');

  const price = Number(job.job_pricing?.price ?? 0);
  if (!price) throw new Error('Set a price on this job before sending it to QuickBooks.');

  const asset = job.assets ? assetLabel(job.assets) : null;
  const description = [SERVICE_LABELS[job.service_type], asset].filter(Boolean).join(' — ');

  // Bill the mapped QBO customer name when set, else the CRM display name.
  const customerName = job.clients.qbo_customer_name?.trim() || job.clients.name;
  const res = await createInvoice({ customerName, amount: price, description });
  if (res.status === 'not_configured') {
    throw new Error('QuickBooks (via I AM CFO) isn’t configured yet — set IAMCFO_API_URL / IAMCFO_API_TOKEN.');
  }
  if (res.status === 'error') {
    const hint = res.candidates?.length ? ` Did you mean: ${res.candidates.join(', ')}?` : '';
    throw new Error(res.message + hint);
  }

  const inv = res.data.invoice;
  const total = Number(inv.totalAmount ?? price);
  const balance = Number(inv.balance ?? total);
  await supabase
    .from('jobs')
    .update({
      qbo_invoice_id: inv.docNumber || inv.id,
      qbo_invoice_status: statusFor(total, balance),
      qbo_balance: balance,
      qbo_synced_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  revalidatePath(`/crm/jobs/${jobId}`);
  revalidatePath('/crm/jobs');
}

export async function refreshJobFromQuickBooks(jobId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('jobs').select('qbo_invoice_id').eq('id', jobId).maybeSingle();
  const number = (data as { qbo_invoice_id: string | null } | null)?.qbo_invoice_id;
  if (!number) throw new Error('This job has no QuickBooks invoice yet.');

  const res = await getInvoices({ number });
  if (res.status !== 'ok') throw new Error(res.status === 'error' ? res.message : 'Books connection not configured.');
  const inv = res.data.invoice;
  if (!inv) throw new Error(`Invoice #${number} was not found in QuickBooks.`);

  const total = Number(inv.totalAmount ?? 0);
  const balance = Number(inv.balance ?? 0);
  await supabase
    .from('jobs')
    .update({
      qbo_invoice_status: statusFor(total, balance),
      qbo_balance: balance,
      qbo_synced_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  revalidatePath(`/crm/jobs/${jobId}`);
}
