'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  ensureCustomer,
  createInvoice,
  getInvoiceStatus,
  disconnect,
} from '@/lib/integrations/quickbooks';
import { assetLabel, SERVICE_LABELS, type ServiceType } from './types';

// Server actions that push CRM records to QuickBooks Online and pull status back.
// Manual, team-triggered. Each runs under the caller's RLS.

interface JobForInvoice {
  id: string;
  service_type: ServiceType;
  qbo_invoice_id: string | null;
  clients: { id: string; name: string; qbo_customer_id: string | null } | null;
  assets: { year: number | null; make: string | null; model: string | null; vin: string | null } | null;
  job_pricing: { price: number | null } | null;
}

export async function sendJobToQuickBooks(jobId: string) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, service_type, qbo_invoice_id, clients(id, name, qbo_customer_id), assets(year, make, model, vin), job_pricing(price)',
    )
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const job = data as JobForInvoice | null;
  if (!job) throw new Error('Job not found.');
  if (job.qbo_invoice_id) throw new Error('This job already has a QuickBooks invoice.');
  if (!job.clients) throw new Error('Add a client to this job before invoicing.');

  const price = Number(job.job_pricing?.price ?? 0);
  if (!price) throw new Error('Set a price on this job before sending it to QuickBooks.');

  // Ensure the client exists as a QBO customer.
  let customerId = job.clients.qbo_customer_id;
  if (!customerId) {
    customerId = await ensureCustomer(job.clients.name);
    await supabase.from('clients').update({ qbo_customer_id: customerId }).eq('id', job.clients.id);
  }

  const asset = job.assets ? assetLabel(job.assets) : null;
  const description = [SERVICE_LABELS[job.service_type], asset].filter(Boolean).join(' — ');
  const invoice = await createInvoice(customerId, price, description);

  await supabase
    .from('jobs')
    .update({
      qbo_invoice_id: invoice.invoiceId,
      qbo_invoice_status: invoice.status,
      qbo_balance: invoice.balance,
      qbo_synced_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  revalidatePath(`/crm/jobs/${jobId}`);
  revalidatePath('/crm/jobs');
}

export async function refreshJobFromQuickBooks(jobId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('jobs')
    .select('qbo_invoice_id')
    .eq('id', jobId)
    .maybeSingle();
  const invoiceId = (data as { qbo_invoice_id: string | null } | null)?.qbo_invoice_id;
  if (!invoiceId) throw new Error('This job has no QuickBooks invoice yet.');

  const status = await getInvoiceStatus(invoiceId);
  await supabase
    .from('jobs')
    .update({
      qbo_invoice_status: status.status,
      qbo_balance: status.balance,
      qbo_synced_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  revalidatePath(`/crm/jobs/${jobId}`);
}

export async function disconnectQuickBooks() {
  await disconnect();
  revalidatePath('/crm/settings');
}
