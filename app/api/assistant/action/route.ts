import { NextResponse } from 'next/server';
import { getCurrentProfile, listClients } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { assetLabel, SERVICE_LABELS, SERVICE_TYPES, JOB_STATUSES, type ServiceType } from '@/lib/crm/types';
import {
  iamcfoConfigured,
  createInvoice as iamcfoCreateInvoice,
  createBill as iamcfoCreateBill,
  updateInvoice as iamcfoUpdateInvoice,
  deleteInvoices as iamcfoDeleteInvoices,
} from '@/lib/integrations/iamcfo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const norm = (s: string) => s.trim().toLowerCase();
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
};
const notConfigured = () =>
  NextResponse.json({ ok: false, error: 'QuickBooks (via I AM CFO) isn’t configured — set IAMCFO_API_URL / IAMCFO_API_TOKEN.' });
// Turn a partner-API error (with optional name candidates) into one line.
const writeError = (message: string, candidates?: string[]) =>
  candidates?.length ? `${message} Did you mean: ${candidates.slice(0, 6).join(', ')}?` : message;

// Resolve a client by name (fuzzy) to its row, or return null + candidates.
async function findClient(query: string) {
  const all = await listClients();
  const q = norm(query);
  const hit =
    all.find((c) => norm(c.name) === q) ??
    all.find((c) => norm(c.name).startsWith(q)) ??
    all.find((c) => norm(c.name).includes(q));
  return { hit, candidates: all.filter((c) => norm(c.name).includes(q)).slice(0, 6).map((c) => c.name) };
}

// ---- time-import parsing (Connecteam shifts → clock_in/clock_out) ----------

// A date cell → YYYY-MM-DD (handles YYYY-MM-DD, MM/DD/YYYY, and common formats).
function parseImportDate(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/](\d{1,2})[/](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// A time cell ("9:00 AM", "17:30", "9am") → minutes since midnight.
function parseClockMinutes(s: string | null): number | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (m) {
    let h = parseInt(m[1], 10); const min = parseInt(m[2], 10); const ap = (m[3] || '').toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    return h * 60 + min;
  }
  m = t.match(/^(\d{1,2})\s*([ap]\.?m\.?)$/i);
  if (m) { let h = parseInt(m[1], 10); const ap = m[2].toLowerCase(); if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0; return h * 60; }
  return null;
}

// Hours worked ("8.5", "8:30", "8h 30m") → minutes.
function parseHoursMinutes(s: string | null): number | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d+):(\d{2})$/); if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = t.match(/(\d+)\s*h(?:ours?)?(?:\s*(\d+)\s*m)?/i); if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  const dec = parseFloat(t); return isNaN(dec) ? null : Math.round(dec * 60);
}

// A shift row → clock_in/clock_out ISO timestamps. UTC-labeled so the duration
// (worked hours) is exact regardless of the source timezone. Handles clock
// in+out, date+hours, overnight shifts, and full-datetime cells.
function buildTimestamps(e: Record<string, unknown>): { clock_in: string; clock_out: string | null } | null {
  const cin = clean(e.clock_in), cout = clean(e.clock_out), hrs = clean(e.hours);
  const date = parseImportDate(clean(e.date)) ?? parseImportDate(cin);
  const iso = (day: string, min: number) => `${day}T${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00.000Z`;
  const inMin = parseClockMinutes(cin), outMin = parseClockMinutes(cout), hoursMin = parseHoursMinutes(hrs);

  if (date && inMin != null) {
    const clock_in = iso(date, inMin);
    let end = outMin;
    if (end == null && hoursMin != null) end = inMin + hoursMin;
    let clock_out: string | null = null;
    if (end != null) {
      const inMs = new Date(clock_in).getTime();
      let outMs = new Date(iso(date, end % (24 * 60))).getTime();
      if (end >= 24 * 60 || outMs < inMs) outMs += 24 * 3600 * 1000; // overnight
      clock_out = new Date(outMs).toISOString();
    }
    return { clock_in, clock_out };
  }
  if (date && hoursMin != null) {
    const clock_in = iso(date, 8 * 60); // no start time given → synthesize an 8:00 start
    return { clock_in, clock_out: new Date(new Date(clock_in).getTime() + hoursMin * 60000).toISOString() };
  }
  if (cin) {
    const d = new Date(cin);
    if (!isNaN(d.getTime())) {
      let clock_out: string | null = null;
      if (cout) { const o = new Date(cout); if (!isNaN(o.getTime())) clock_out = o.toISOString(); }
      else if (hoursMin != null) clock_out = new Date(d.getTime() + hoursMin * 60000).toISOString();
      return { clock_in: d.toISOString(), clock_out };
    }
  }
  return null;
}

// Executes a Zordon action ONLY after the human confirmed it in the UI. The
// model never reaches here — the browser posts the confirmed proposal. Owner/
// admin only. Each action mirrors the CRM's own write paths.
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) return NextResponse.json({ ok: false, error: 'Owner/admin only.' }, { status: 403 });

  let body: { kind?: string; input?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request.' }, { status: 400 });
  }
  const kind = body.kind;
  const input = body.input ?? {};
  const supabase = await createServerSupabase();

  try {
    // ---- CRM writes --------------------------------------------------------
    if (kind === 'create_client') {
      const name = clean(input.name);
      if (!name) return NextResponse.json({ ok: false, error: 'A client name is required.' });
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name,
          category: clean(input.category),
          billing_email: clean(input.billing_email),
          phone: clean(input.phone),
          address: clean(input.address),
          notes: clean(input.notes),
        })
        .select('id')
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message });
      return NextResponse.json({ ok: true, message: `Client “${name}” created.`, id: (data as { id: string }).id });
    }

    if (kind === 'create_contact') {
      const name = clean(input.name);
      if (!name) return NextResponse.json({ ok: false, error: 'A contact name is required.' });
      const { hit, candidates } = await findClient(String(input.client ?? ''));
      if (!hit) return NextResponse.json({ ok: false, error: `No client matched “${input.client}”.${candidates.length ? ` Did you mean: ${candidates.join(', ')}?` : ''}` });
      const { error } = await supabase.from('contacts').insert({
        client_id: hit.id,
        name,
        title: clean(input.title),
        email: clean(input.email),
        phone: clean(input.phone),
      });
      if (error) return NextResponse.json({ ok: false, error: error.message });
      return NextResponse.json({ ok: true, message: `Added ${name} to ${hit.name}.` });
    }

    if (kind === 'create_asset') {
      const { hit, candidates } = await findClient(String(input.client ?? ''));
      if (!hit) return NextResponse.json({ ok: false, error: `No client matched “${input.client}”.${candidates.length ? ` Did you mean: ${candidates.join(', ')}?` : ''}` });
      const year = Number.isFinite(Number(input.year)) ? Math.trunc(Number(input.year)) : null;
      const mileage = Number.isFinite(Number(input.mileage)) ? Math.trunc(Number(input.mileage)) : null;
      const { error } = await supabase.from('assets').insert({
        client_id: hit.id,
        asset_type: 'vehicle',
        year,
        make: clean(input.make),
        model: clean(input.model),
        vin: clean(input.vin),
        license_plate: clean(input.license_plate),
        color: clean(input.color),
        mileage,
        notes: clean(input.notes),
      });
      if (error) return NextResponse.json({ ok: false, error: error.message });
      const label = assetLabel({ year, make: clean(input.make), model: clean(input.model), vin: clean(input.vin) });
      return NextResponse.json({ ok: true, message: `Added ${label} to ${hit.name}.` });
    }

    if (kind === 'create_job') {
      const service_type = SERVICE_TYPES.includes(input.service_type as ServiceType)
        ? (input.service_type as ServiceType)
        : null;
      if (!service_type) return NextResponse.json({ ok: false, error: 'A valid service_type is required.' });
      const { hit, candidates } = await findClient(String(input.client ?? ''));
      if (!hit) return NextResponse.json({ ok: false, error: `No client matched “${input.client}”.${candidates.length ? ` Did you mean: ${candidates.join(', ')}?` : ''}` });
      const status = JOB_STATUSES.includes(String(input.status) as never) ? String(input.status) : 'requested';
      const { data, error } = await supabase
        .from('jobs')
        .insert({
          client_id: hit.id,
          service_type,
          status,
          scheduled_date: isDay(input.scheduled_date) ? input.scheduled_date : null,
          location: clean(input.location),
          notes: clean(input.notes),
        })
        .select('id')
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message });
      const jobId = (data as { id: string }).id;
      const price = Number.isFinite(Number(input.price)) ? Number(input.price) : null;
      const cost = Number.isFinite(Number(input.cost)) ? Number(input.cost) : null;
      if (price !== null || cost !== null) {
        await supabase.from('job_pricing').upsert({ job_id: jobId, price, cost });
      }
      return NextResponse.json({
        ok: true,
        message: `${SERVICE_LABELS[service_type]} job created for ${hit.name}${price != null ? ` · ${usd(price)}` : ''}.`,
        id: jobId,
      });
    }

    if (kind === 'update_job') {
      const id = clean(input.id);
      if (!id) return NextResponse.json({ ok: false, error: 'A job id is required.' });
      const patch: Record<string, unknown> = {};
      if (JOB_STATUSES.includes(String(input.status) as never)) {
        patch.status = String(input.status);
        if (input.status === 'completed') patch.completed_date = new Date().toISOString().slice(0, 10);
      }
      if (Object.keys(patch).length) {
        const { error } = await supabase.from('jobs').update(patch).eq('id', id);
        if (error) return NextResponse.json({ ok: false, error: error.message });
      }
      const price = Number.isFinite(Number(input.price)) ? Number(input.price) : null;
      const cost = Number.isFinite(Number(input.cost)) ? Number(input.cost) : null;
      if (input.price != null || input.cost != null) {
        const { error } = await supabase.from('job_pricing').upsert({ job_id: id, price, cost });
        if (error) return NextResponse.json({ ok: false, error: error.message });
      }
      const bits = [
        patch.status ? `status → ${patch.status}` : null,
        input.price != null ? `price → ${usd(price ?? 0)}` : null,
        input.cost != null ? `cost → ${usd(cost ?? 0)}` : null,
      ].filter(Boolean);
      if (!bits.length) return NextResponse.json({ ok: false, error: 'Nothing to change — give a status, price, or cost.' });
      return NextResponse.json({ ok: true, message: `Job updated (${bits.join(', ')}).` });
    }

    // ---- QuickBooks writes (via I AM CFO → Pride Dealer Services books) -----
    if (kind === 'invoice_job') {
      if (!iamcfoConfigured()) return notConfigured();
      const id = clean(input.id);
      if (!id) return NextResponse.json({ ok: false, error: 'A job id is required.' });
      const { data, error } = await supabase
        .from('jobs')
        .select('id, service_type, qbo_invoice_id, clients(name, qbo_customer_name), assets(year, make, model, vin), job_pricing(price)')
        .eq('id', id)
        .maybeSingle();
      if (error) return NextResponse.json({ ok: false, error: error.message });
      const job = data as {
        id: string;
        service_type: ServiceType;
        qbo_invoice_id: string | null;
        clients: { name: string; qbo_customer_name: string | null } | null;
        assets: { year: number | null; make: string | null; model: string | null; vin: string | null } | null;
        job_pricing: { price: number | null } | null;
      } | null;
      if (!job) return NextResponse.json({ ok: false, error: 'Job not found.' });
      if (job.qbo_invoice_id) return NextResponse.json({ ok: false, error: 'This job already has a QuickBooks invoice.' });
      if (!job.clients) return NextResponse.json({ ok: false, error: 'Add a client to this job before invoicing.' });
      const price = Number(job.job_pricing?.price ?? 0);
      if (!price) return NextResponse.json({ ok: false, error: 'Set a price on this job before invoicing it.' });

      const asset = job.assets ? assetLabel(job.assets) : null;
      const description = [SERVICE_LABELS[job.service_type], asset].filter(Boolean).join(' — ');
      const customerName = job.clients.qbo_customer_name?.trim() || job.clients.name;
      const res = await iamcfoCreateInvoice({ customerName, amount: price, description });
      if (res.status === 'not_configured') return notConfigured();
      if (res.status === 'error') return NextResponse.json({ ok: false, error: writeError(res.message, res.candidates) });
      const inv = res.data.invoice;
      const total = Number(inv.totalAmount ?? price);
      const balance = Number(inv.balance ?? total);
      await supabase
        .from('jobs')
        .update({
          qbo_invoice_id: inv.docNumber || inv.id,
          qbo_invoice_status: balance <= 0 ? 'paid' : balance < total ? 'partial' : 'unpaid',
          qbo_balance: balance,
          qbo_synced_at: new Date().toISOString(),
        })
        .eq('id', id);
      const num = inv.docNumber ? ` #${inv.docNumber}` : '';
      return NextResponse.json({ ok: true, message: `Invoiced ${job.clients.name}${num} — ${usd(price)} in QuickBooks (saved, not emailed).` });
    }

    if (kind === 'create_invoice') {
      if (!iamcfoConfigured()) return notConfigured();
      const customer = clean(input.customer);
      const amount = Number(input.amount);
      if (!customer) return NextResponse.json({ ok: false, error: 'A customer name is required.' });
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: 'A positive amount is required.' });
      const res = await iamcfoCreateInvoice({
        customerName: customer,
        amount,
        description: clean(input.description) ?? undefined,
        dueDate: isDay(input.due_date) ? input.due_date : undefined,
      });
      if (res.status === 'not_configured') return notConfigured();
      if (res.status === 'error') return NextResponse.json({ ok: false, error: writeError(res.message, res.candidates) });
      const inv = res.data.invoice;
      const num = inv.docNumber ? ` #${inv.docNumber}` : '';
      return NextResponse.json({ ok: true, message: `Invoice${num} created in QuickBooks — ${usd(inv.totalAmount)} to ${inv.customer}. Saved in QBO, not emailed.` });
    }

    if (kind === 'create_bill') {
      if (!iamcfoConfigured()) return notConfigured();
      const vendor = clean(input.vendor);
      const amount = Number(input.amount);
      if (!vendor) return NextResponse.json({ ok: false, error: 'A vendor name is required.' });
      if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ ok: false, error: 'A positive amount is required.' });
      const res = await iamcfoCreateBill({
        vendorName: vendor,
        amount,
        description: clean(input.description) ?? undefined,
        accountName: clean(input.account) ?? undefined,
        docNumber: clean(input.bill_number) ?? undefined,
        txnDate: isDay(input.bill_date) ? input.bill_date : undefined,
        dueDate: isDay(input.due_date) ? input.due_date : undefined,
      });
      if (res.status === 'not_configured') return notConfigured();
      if (res.status === 'error') return NextResponse.json({ ok: false, error: writeError(res.message, res.candidates) });
      const bill = res.data.bill;
      const num = bill.docNumber ? ` #${bill.docNumber}` : '';
      return NextResponse.json({ ok: true, message: `Bill${num} created in QuickBooks — ${usd(bill.totalAmount)} to ${bill.vendor}.` });
    }

    if (kind === 'update_invoice') {
      if (!iamcfoConfigured()) return notConfigured();
      const invoiceNumber = clean(input.invoice_number);
      if (!invoiceNumber) return NextResponse.json({ ok: false, error: 'An invoice number is required.' });
      const txnDate = isDay(input.date) ? input.date : undefined;
      const dueDate = isDay(input.due_date) ? input.due_date : undefined;
      const customerName = clean(input.customer) ?? undefined;
      if (!txnDate && !dueDate && !customerName) {
        return NextResponse.json({ ok: false, error: 'Nothing to change — give a new date and/or customer.' });
      }
      const res = await iamcfoUpdateInvoice({ invoiceNumber, txnDate, dueDate, customerName });
      if (res.status === 'not_configured') return notConfigured();
      if (res.status === 'error') return NextResponse.json({ ok: false, error: writeError(res.message, res.candidates) });
      if (!res.data.ok) return NextResponse.json({ ok: false, error: res.data.message ?? `Invoice #${invoiceNumber} wasn’t changed.` });
      const inv = res.data.invoice;
      const bits = [
        txnDate ? `date → ${inv?.txnDate ?? txnDate}` : null,
        customerName ? `customer → ${inv?.customer ?? customerName}` : null,
      ].filter(Boolean);
      return NextResponse.json({ ok: true, message: `Invoice #${inv?.docNumber ?? invoiceNumber} updated (${bits.join(', ')}).` });
    }

    if (kind === 'delete_invoices') {
      if (!iamcfoConfigured()) return notConfigured();
      const list = Array.isArray(input.invoices) ? (input.invoices as Record<string, unknown>[]) : [];
      const ids = Array.from(new Set(list.map((i) => String(i.id ?? '').trim()).filter(Boolean)));
      if (!ids.length) return NextResponse.json({ ok: false, error: 'No invoices to delete.' });
      const res = await iamcfoDeleteInvoices(ids);
      if (res.status === 'not_configured') return notConfigured();
      if (res.status === 'error') return NextResponse.json({ ok: false, error: writeError(res.message, res.candidates) });
      const d = res.data;
      const parts = [`Deleted ${d.deleted_count} duplicate invoice${d.deleted_count === 1 ? '' : 's'} in QuickBooks`];
      if (d.skipped_paid.length) parts.push(`${d.skipped_paid.length} skipped (paid — left alone)`);
      if (d.not_found.length) parts.push(`${d.not_found.length} not found`);
      if (d.errors.length) parts.push(`${d.errors.length} error${d.errors.length === 1 ? '' : 's'} — ${d.errors.slice(0, 3).join('; ')}`);
      return NextResponse.json({ ok: true, message: parts.join(' · ') + '.' });
    }

    // ---- Bulk contact import ----------------------------------------------
    if (kind === 'import_contacts') {
      const list = Array.isArray(input.contacts) ? (input.contacts as Record<string, unknown>[]) : [];
      if (!list.length) return NextResponse.json({ ok: false, error: 'No contacts to import.' });

      // Preload existing contacts so we only add the missing ones (idempotent).
      const existingEmails = new Set<string>();
      const existingNameKeys = new Set<string>();
      {
        const { data } = await supabase.from('contacts').select('client_id, name, email');
        for (const row of (data ?? []) as { client_id: string | null; name: string | null; email: string | null }[]) {
          const e = String(row.email ?? '').trim().toLowerCase();
          if (e) existingEmails.add(e);
          const nm = String(row.name ?? '').trim().toLowerCase();
          const cid = String(row.client_id ?? '');
          if (nm && cid) existingNameKeys.add(`${cid}::${nm}`);
        }
      }

      const clientIdByName = new Map<string, string>();
      let clientsCreated = 0;
      let contactsCreated = 0;
      let alreadyPresent = 0;
      const skipped: string[] = [];

      for (const c of list.slice(0, 5000)) {
        const clientName = String(c.company ?? '').trim();
        const contactName = String(c.name ?? '').trim();
        if (!clientName && !contactName) continue;

        let clientId: string | undefined;
        if (clientName) {
          const key = clientName.toLowerCase();
          clientId = clientIdByName.get(key);
          if (!clientId) {
            const { data: found } = await supabase.from('clients').select('id').ilike('name', clientName).limit(1).maybeSingle();
            clientId = (found as { id: string } | null)?.id ?? undefined;
            if (!clientId) {
              const { data: created } = await supabase.from('clients').insert({ name: clientName }).select('id').single();
              clientId = (created as { id: string } | null)?.id ?? undefined;
              if (clientId) clientsCreated += 1;
            }
            if (clientId) clientIdByName.set(key, clientId);
          }
        }
        if (!clientId) {
          skipped.push(contactName || clientName || 'row');
          continue;
        }

        const email = String(c.email ?? '').trim();
        const emailKey = email.toLowerCase();
        const nameKey = `${clientId}::${contactName.toLowerCase()}`;
        const already = (emailKey && existingEmails.has(emailKey)) || (!email && contactName && existingNameKeys.has(nameKey));
        if (already) {
          alreadyPresent += 1;
          continue;
        }

        const { error } = await supabase.from('contacts').insert({
          client_id: clientId,
          name: contactName || email || 'Contact',
          email: email || null,
          phone: c.phone ? String(c.phone).trim() : null,
          title: c.title ? String(c.title).trim() : null,
        });
        if (error) skipped.push(contactName || clientName);
        else {
          contactsCreated += 1;
          if (emailKey) existingEmails.add(emailKey);
          if (contactName) existingNameKeys.add(nameKey);
        }
      }

      const parts = [`Imported ${contactsCreated} new contact${contactsCreated === 1 ? '' : 's'}`];
      if (clientsCreated) parts.push(`created ${clientsCreated} new client${clientsCreated === 1 ? '' : 's'}`);
      if (alreadyPresent) parts.push(`${alreadyPresent} already in the CRM (skipped)`);
      if (skipped.length) parts.push(`${skipped.length} couldn't be added`);
      return NextResponse.json({ ok: true, message: parts.join(' · ') + '.' });
    }

    // ---- Team import (Connecteam people export → staff roster) -------------
    if (kind === 'import_staff') {
      const list = Array.isArray(input.staff) ? (input.staff as Record<string, unknown>[]) : [];
      if (!list.length) return NextResponse.json({ ok: false, error: 'No team members to import.' });

      const byName = new Set<string>();
      const byEmail = new Set<string>();
      {
        const { data } = await supabase.from('staff').select('name, email');
        for (const r of (data ?? []) as { name: string | null; email: string | null }[]) {
          const n = String(r.name ?? '').trim().toLowerCase();
          if (n) byName.add(n);
          const e = String(r.email ?? '').trim().toLowerCase();
          if (e) byEmail.add(e);
        }
      }

      let created = 0;
      let present = 0;
      const skipped: string[] = [];
      for (const s of list.slice(0, 5000)) {
        const name = String(s.name ?? '').trim();
        if (!name) continue;
        const email = clean(s.email);
        const emailKey = email?.toLowerCase();
        if (byName.has(name.toLowerCase()) || (emailKey && byEmail.has(emailKey))) { present += 1; continue; }
        const { error } = await supabase.from('staff').insert({
          name,
          email,
          phone: clean(s.phone),
          title: clean(s.title),
          is_active: s.active === false ? false : true,
        });
        if (error) skipped.push(name);
        else { created += 1; byName.add(name.toLowerCase()); if (emailKey) byEmail.add(emailKey); }
      }

      const parts = [`Imported ${created} new team member${created === 1 ? '' : 's'}`];
      if (present) parts.push(`${present} already in the roster (skipped)`);
      if (skipped.length) parts.push(`${skipped.length} couldn't be added`);
      return NextResponse.json({ ok: true, message: parts.join(' · ') + '.' });
    }

    // ---- Hours import (Connecteam time-clock export → time_entries) --------
    if (kind === 'import_time') {
      const list = Array.isArray(input.entries) ? (input.entries as Record<string, unknown>[]) : [];
      if (!list.length) return NextResponse.json({ ok: false, error: 'No shifts to import.' });

      const staffByName = new Map<string, string>();
      {
        const { data } = await supabase.from('staff').select('id, name');
        for (const r of (data ?? []) as { id: string; name: string | null }[]) {
          const n = String(r.name ?? '').trim().toLowerCase();
          if (n) staffByName.set(n, r.id);
        }
      }
      // Preload existing shifts (staff + start) so re-imports don't double-count.
      const existing = new Set<string>();
      {
        const { data } = await supabase.from('time_entries').select('staff_id, clock_in');
        for (const r of (data ?? []) as { staff_id: string; clock_in: string }[]) {
          existing.add(`${r.staff_id}::${new Date(r.clock_in).toISOString()}`);
        }
      }

      let created = 0;
      let dup = 0;
      let staffCreated = 0;
      const skipped: string[] = [];
      for (const e of list.slice(0, 10000)) {
        const emp = String(e.employee ?? '').trim();
        if (!emp) continue;
        let staffId = staffByName.get(emp.toLowerCase());
        if (!staffId) {
          const { data: made } = await supabase.from('staff').insert({ name: emp }).select('id').single();
          staffId = (made as { id: string } | null)?.id ?? undefined;
          if (staffId) { staffByName.set(emp.toLowerCase(), staffId); staffCreated += 1; }
        }
        if (!staffId) { skipped.push(emp); continue; }
        const ts = buildTimestamps(e);
        if (!ts) { skipped.push(emp); continue; }
        const key = `${staffId}::${new Date(ts.clock_in).toISOString()}`;
        if (existing.has(key)) { dup += 1; continue; }
        const { error } = await supabase.from('time_entries').insert({
          staff_id: staffId,
          clock_in: ts.clock_in,
          clock_out: ts.clock_out,
          notes: clean(e.notes),
        });
        if (error) skipped.push(emp);
        else { created += 1; existing.add(key); }
      }

      const parts = [`Imported ${created} shift${created === 1 ? '' : 's'}`];
      if (staffCreated) parts.push(`added ${staffCreated} new team member${staffCreated === 1 ? '' : 's'}`);
      if (dup) parts.push(`${dup} already imported (skipped)`);
      if (skipped.length) parts.push(`${skipped.length} couldn't be added`);
      return NextResponse.json({ ok: true, message: parts.join(' · ') + '.' });
    }

    return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Action failed.' }, { status: 500 });
  }
}
