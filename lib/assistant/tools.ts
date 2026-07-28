import type Anthropic from '@anthropic-ai/sdk';
import {
  clientPerformance,
  createAssistantDraft,
  createAssistantMemory,
  createAssistantReport,
  getClient,
  getClientAssets,
  getClientContacts,
  getConditionReport,
  getDashboardStats,
  getJob,
  jobAnalytics,
  listAssets,
  listClients,
  listContacts,
  listJobs,
  listLeads,
  listStaff,
} from '@/lib/crm/data';
import {
  assetLabel,
  JOB_STATUSES,
  SERVICE_TYPES,
  type Client,
  type DraftKind,
  type JobStatus,
  type Lead,
  type MemoryCategory,
  type ServiceType,
} from '@/lib/crm/types';
import {
  getBills,
  getDuplicateInvoices,
  getInvoices,
} from '@/lib/integrations/iamcfo';
import {
  getArAging,
  getBooksFreshness,
  getCashFlow,
  getCashFlowStatement,
  getCompanyFinancials,
  getCustomerFinancials,
} from '@/lib/integrations/pdsbooks';
import { runSpecialist, SPECIALIST_KEYS } from './specialists';
import { BUILD_REPORT_INPUT_SCHEMA, normalizeReportInput } from './reportBlocks';

// Zordon's hands — the tool registry over the whole CRM. Read tools resolve
// human names to ids server-side (the model never juggles a UUID), run under the
// caller's RLS, and return compact JSON. Gated write tools (ACTION_TOOLS) are
// intercepted by the loop as proposals and confirmed by a human before the app
// runs them; if one ever reaches dispatch it refuses. save_draft / remember /
// build_report / delegate run freely (they store to Zordon's own tables or
// consult a read-only specialist — none touch the live business or QuickBooks).

type Json = Record<string, unknown>;

// ---- name resolution --------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

function pickBest<T>(query: string, items: T[], nameOf: (t: T) => string): { hit?: T; candidates: T[] } {
  const q = norm(query);
  const exact = items.filter((t) => norm(nameOf(t)) === q);
  if (exact.length === 1) return { hit: exact[0], candidates: [] };
  const starts = items.filter((t) => norm(nameOf(t)).startsWith(q));
  if (starts.length === 1) return { hit: starts[0], candidates: [] };
  const includes = items.filter((t) => norm(nameOf(t)).includes(q));
  if (includes.length === 1) return { hit: includes[0], candidates: [] };
  return { hit: undefined, candidates: (exact.length ? exact : starts.length ? starts : includes).slice(0, 8) };
}

async function resolveClient(query: string): Promise<{ client?: Client; error?: Json }> {
  const all = await listClients();
  const byId = all.find((c) => c.id === query);
  if (byId) return { client: byId };
  const { hit, candidates } = pickBest(query, all, (c) => c.name);
  if (hit) return { client: hit };
  return { error: { error: `No single client matched "${query}".`, candidates: candidates.map((c) => c.name) } };
}

async function resolveLead(query: string): Promise<{ lead?: Lead; error?: Json }> {
  const all = await listLeads();
  const byName = pickBest(query, all, (l) => l.name);
  const chosen = byName.hit ?? pickBest(query, all, (l) => l.email).hit;
  if (chosen) return { lead: chosen };
  return {
    error: {
      error: `No single lead matched "${query}".`,
      candidates: byName.candidates.map((l) => ({ name: l.name, email: l.email, company: l.company })),
    },
  };
}

const clamp = (n: unknown, def: number, max: number) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : def;
};

// PDS's QuickBooks lives in I AM CFO (org "PDS Logix" / Pride Dealer Services).
// This maps a partner-API Result into the {configured:false} | {error} | data
// shape the model reads.
const NOT_CONFIGURED = {
  configured: false,
  message: 'QuickBooks (via I AM CFO) isn’t configured — set IAMCFO_API_URL / IAMCFO_API_TOKEN.',
};

// The books reads (financials, client_financials, ar_aging, cash_calendar,
// refresh_books) come from the PDS Logix data warehouse, not the partner API.
const BOOKS_NOT_CONFIGURED = {
  configured: false,
  message: 'The books aren’t connected — set PDS_BOOKS_SUPABASE_URL / PDS_BOOKS_SUPABASE_KEY.',
};

// ---- tool schemas -----------------------------------------------------------

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'data_overview',
    description:
      'At-a-glance state of the business: counts of clients, assets, staff, open jobs and leads, a job count per status, and pipeline vs invoiced dollar totals. Start here for "how are we doing" questions.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_clients',
    description:
      'List clients (dealers, fleets, insurers). Optional case-insensitive name search. Returns id, name, category, phone, billing email.',
    input_schema: { type: 'object', properties: { search: { type: 'string', description: 'Optional name filter.' } } },
  },
  {
    name: 'get_client',
    description:
      'Full profile for one client by name (or id): fields, contacts, and linked assets. Use after list_clients if a name is ambiguous.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Client name or id.' } },
      required: ['name'],
    },
  },
  {
    name: 'list_contacts',
    description: 'All contacts across clients: name, title, email, phone, and the client they work at.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_staff',
    description: 'The staff roster: name, title, contact info, and active flag.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_assets',
    description: 'All assets (vehicles) across clients: year/make/model, VIN, plate, mileage, and owning client.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_jobs',
    description:
      'List jobs, most recent first. Optionally filter by status (requested, scheduled, in_progress, completed, invoiced) or service_type (condition_report, detailing, biohazard). Returns client, asset, staff, status, dates, price, cost.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: JOB_STATUSES as unknown as string[] },
        service_type: { type: 'string', enum: SERVICE_TYPES as unknown as string[] },
      },
    },
  },
  {
    name: 'get_job',
    description: 'Full detail for one job by id, including pricing/margin and its condition report if any.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Job id (from list_jobs).' } },
      required: ['id'],
    },
  },
  {
    name: 'list_leads',
    description: 'The inbound lead pipeline: name, company, service interest, contact info, message, date.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_lead',
    description:
      'Full context for one lead by name or email: their message, service interest, company, and contact info. Read this before drafting a follow-up so the draft is grounded in what they actually asked for.',
    input_schema: {
      type: 'object',
      properties: { lead: { type: 'string', description: 'Lead name or email (fuzzy-matched).' } },
      required: ['lead'],
    },
  },
  {
    name: 'client_performance',
    description:
      'Per-client ranking: job count, completed count, pipeline vs invoiced dollars, and total value — biggest book of business first. Use for "who are our biggest clients" or account reviews.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'job_analytics',
    description:
      'Deep operational rollup: jobs by status and by service type, pipeline vs invoiced totals, total and average margin (price − cost), and the completed jobs that are NOT yet invoiced (money on the table). Use for "how is the operation running" or "what should we invoice next".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_invoices',
    description:
      'SEE invoices from QuickBooks — dates, due dates, amounts, balances (paid vs open), and customers. Pass a specific `number` to pull one, or omit it to list newest-first (set open_only for just the unpaid ones). Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'A specific invoice number to look up (optional).' },
        open_only: { type: 'boolean', description: 'When listing, only invoices with an outstanding balance.' },
        limit: { type: 'number', description: 'Max invoices to list (default 50, max 200).' },
      },
    },
  },
  {
    name: 'get_bills',
    description:
      'SEE bills from QuickBooks (money PDS owes vendors/suppliers) — vendor, dates, amounts, balances. Pass a specific `number`, or omit to list newest-first (open_only for unpaid). Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'A specific bill number to look up (optional).' },
        open_only: { type: 'boolean', description: 'When listing, only unpaid bills.' },
        limit: { type: 'number', description: 'Max bills to list (default 50, max 200).' },
      },
    },
  },
  {
    name: 'find_duplicate_invoices',
    description:
      'READ-ONLY: find invoice numbers that appear more than once in QuickBooks (accidental duplicates). Returns each duplicated number with its invoices (id, customer, amount, date, paid). To remove them, propose delete_invoices with the EXTRA copies — a paid invoice is never deleted.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'financials',
    description:
      "The company's real books from QuickBooks — the SAME ledger the pdslogix.net dashboards read (the accounting source of truth). Returns a QBO-accurate P&L (revenue, COGS, gross profit + gross margin, operating expenses, other income/expense, net income + net margin), cash on hand, receivables (total + past due), and payables. Use for 'what's our P&L', 'how's our margin', 'how much cash', 'how are the books', or to lead a financial report. Scope to a period with from/to (YYYY-MM-DD); omit for the current month (falls back to the most recent month with activity so you never report a false $0). For a per-client breakdown use client_financials; for receivables aging use ar_aging. You read and explain the books here — you can post invoices/bills (gated) but not journal entries.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Period start YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'Period end YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'client_financials',
    description:
      "Per-CUSTOMER P&L from the books, ranked by revenue — the client-profitability breakdown the dashboards show. Each customer gets revenue, COGS, gross profit, operating expenses, net income, and margins, computed exactly like QuickBooks' P&L-by-Customer. Use for 'which clients make us the most', 'profitability by client', 'how's Manheim Dallas doing', or client-profitability reports. Customer names are the QuickBooks names (sub-customers appear as 'Parent:Sub', e.g. 'Cox Automotive Corporate Services, LLC:Manheim Dallas'); 'Not specified' (QuickBooks' own label) is overhead not tagged to a customer. Scope with from/to (YYYY-MM-DD); omit for the current month (falls back to the latest month with activity).",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Period start YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'Period end YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'ar_aging',
    description:
      "Accounts-receivable aging by client — who owes us and how overdue. Each client's open balance is bucketed Current (≤30 days past due), 31–60, 61–90, and 90+, with totals; sub-customers roll up to the parent client. Point-in-time (today). Use for 'who owes us', 'A/R aging', 'past-due receivables', or collections reports. Past-due figures also appear as a total in financials; this breaks them out by client and age.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cash_flow',
    description:
      "The Statement of Cash Flows for a period — where cash actually moved, computed the direct/offset method exactly like the pdslogix.net dashboards (and reconciles to QuickBooks' Statement of Cash Flows to the penny). Returns net cash change for the period split into Operating, Investing, and Financing, with the driving accounts in each (and operating broken into money-in vs money-out). Use for 'what's our cash flow', 'where did the cash go', 'how much cash did we generate/burn', or a cash-flow report. Bank-to-bank transfers net out automatically. Scope with from/to (YYYY-MM-DD); omit for the current month (falls back to the latest month with activity). NOTE: this is actual cash movement (historical); for what's still coming in/owed out use cash_calendar.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Period start YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'Period end YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'cash_calendar',
    description:
      "Forward cash view from the books: money DUE IN (open receivables with real due dates, by client) and money OWED OUT (open payables, by vendor), plus the net expected. Use for FORWARD-looking cash questions — what's still coming in, who owes us and when, what we owe out. This is open/upcoming items, NOT cash that already moved — for the actual Statement of Cash Flows (operating/investing/financing) use cash_flow. Optionally scope by due date with from/to (YYYY-MM-DD); omit to see all open items. For overdue-by-age use ar_aging.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Only items due on/after this date YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'Only items due on/before this date YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'refresh_books',
    description:
      "Check how current the books are — returns the latest ledger date (as-of) and the total line count. The books are synced from QuickBooks automatically on the I AM CFO side; this reports freshness rather than triggering a sync. Use when someone asks 'how current are the books', 'when were these last updated', or before a report if they wonder whether the numbers are stale.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'save_draft',
    description:
      "Save a follow-up / quote email you've composed as a DRAFT. This does NOT send anything — the draft lands on the Drafts review page (/crm/assistant/drafts) for a human to read and send from their own mail. Compose the full subject and body yourself first (grounded in get_lead / get_client), then call this once. Link it to the lead/client when you can.",
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['follow_up', 'quote', 'reply', 'other'], description: 'What kind of email this is.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'The full email body, ready to send as-is.' },
        to_name: { type: 'string', description: 'Recipient name, if known.' },
        to_email: { type: 'string', description: 'Recipient email, if known.' },
        lead: { type: 'string', description: 'Lead this is for (name/email), to link the draft. Optional.' },
        client: { type: 'string', description: 'Client this is for (name), to link the draft. Optional.' },
      },
      required: ['kind', 'subject', 'body'],
    },
  },
  {
    name: 'remember',
    description:
      "Save a durable fact worth carrying across every future conversation — a standing preference, a fact about a client, or how PDS likes to operate (e.g. 'Dealer X wants condition reports within 24h', 'We don't discount biohazard jobs'). These load into your memory automatically next time. Only save things that stay true over time — never transient details from the current chat, and don't duplicate something you already remember.",
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact, stated plainly and self-contained.' },
        category: { type: 'string', enum: ['business', 'client', 'operations', 'preference', 'general'], description: 'What kind of fact this is.' },
        subject: { type: 'string', description: 'Who/what it is about (e.g. a client name). Optional.' },
        client: { type: 'string', description: 'Client it concerns (name), to link it. Optional.' },
      },
      required: ['content'],
    },
  },
  {
    name: 'build_report',
    description:
      "Compose a VISUAL report and save it — the way to answer 'make me a report', 'show me a breakdown', or any ask that deserves charts, not a wall of text. First gather the real numbers with your other tools, THEN call this once with an ordered list of blocks. Block types: `kpis` (headline stat tiles), `bar` (ranked comparison), `line` (trend over time), `table` (rows/columns), `callout` (a key takeaway), `text` (narrative). The report renders as a shareable page; after saving, tell the user it's ready and give the one-line summary. Use real figures from tool results only.",
    input_schema: BUILD_REPORT_INPUT_SCHEMA,
  },
  {
    name: 'delegate',
    description:
      "Hand a focused brief to a specialist on your team and get their report back. Specialists: operations_analyst (jobs pipeline, margins, throughput → prioritized ops moves), pipeline_strategist (leads + clients → where the next revenue is), client_manager (a shareable account review + upsell/retention moves for one client), quality_reviewer (condition-report / job-quality review), outreach_writer (writes a ready-to-send follow-up/quote email for a lead — you then save it with save_draft). When asked to improve or work on the operation, a client, or the pipeline, assemble the relevant specialists — one delegate call each with a specific brief — then synthesize their reports into one prioritized plan. Name the client/context in the brief; the specialist can't see this conversation.",
    input_schema: {
      type: 'object',
      properties: {
        specialist: { type: 'string', enum: SPECIALIST_KEYS },
        brief: { type: 'string', description: 'A self-contained brief: who/what to work on and what you want back.' },
      },
      required: ['specialist', 'brief'],
    },
  },

  // ---- gated write actions (proposed, confirmed by a human) ----------------
  {
    name: 'create_client',
    description:
      'PROPOSE creating a new client (dealer, fleet, or insurer). Does NOT create it — asks the user to confirm first. Never claim it exists until confirmed.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        category: { type: 'string', description: 'e.g. dealer / fleet / insurer (optional).' },
        billing_email: { type: 'string' },
        phone: { type: 'string' },
        address: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_contact',
    description:
      'PROPOSE adding a contact (a person) to a client. Does NOT create it — asks the user to confirm first. Give the client name and the contact’s name; email/phone/title optional.',
    input_schema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client this contact works at (fuzzy-matched).' },
        name: { type: 'string' },
        title: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['client', 'name'],
    },
  },
  {
    name: 'create_asset',
    description:
      'PROPOSE adding an asset (a vehicle) for a client. Does NOT create it — asks the user to confirm first. Give the client and as much of year/make/model/VIN/plate/mileage as known.',
    input_schema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Owning client (fuzzy-matched).' },
        year: { type: 'integer' },
        make: { type: 'string' },
        model: { type: 'string' },
        vin: { type: 'string' },
        license_plate: { type: 'string' },
        mileage: { type: 'integer' },
        color: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['client'],
    },
  },
  {
    name: 'create_job',
    description:
      'PROPOSE creating a service job. Does NOT create it — asks the user to confirm first. Give the client, the service_type (condition_report / detailing / biohazard), and any known fields (asset, staff, schedule, price, cost). Never claim it exists until confirmed.',
    input_schema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Client the job is for (fuzzy-matched).' },
        service_type: { type: 'string', enum: SERVICE_TYPES as unknown as string[] },
        status: { type: 'string', enum: JOB_STATUSES as unknown as string[], description: 'Default requested.' },
        scheduled_date: { type: 'string', description: 'YYYY-MM-DD (optional).' },
        location: { type: 'string' },
        price: { type: 'number', description: 'Job price in USD (optional).' },
        cost: { type: 'number', description: 'Job cost in USD (optional).' },
        notes: { type: 'string' },
      },
      required: ['client', 'service_type'],
    },
  },
  {
    name: 'update_job',
    description:
      "PROPOSE changing a job — its status and/or its price/cost. Does NOT change it — asks the user to confirm first. Pass the job id (from list_jobs/get_job) and only the field(s) that change. Use for 'mark job X completed' or 'set job X price to $240'.",
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Job id.' },
        status: { type: 'string', enum: JOB_STATUSES as unknown as string[] },
        price: { type: 'number' },
        cost: { type: 'number' },
      },
      required: ['id'],
    },
  },
  {
    name: 'invoice_job',
    description:
      "PROPOSE sending a job to QuickBooks — creates the invoice for that job (customer = its client, amount = its price) and links it back. Does NOT post — asks the user to confirm first. The job must have a client and a price set, and not already be invoiced. The invoice is SAVED in QBO, not emailed.",
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Job id to invoice.' } },
      required: ['id'],
    },
  },
  {
    name: 'create_invoice',
    description:
      "PROPOSE creating an ad-hoc invoice in QuickBooks (money a client owes us) not tied to one job. Does NOT post — asks the user to confirm first. Give the customer/client name as it appears in the books, the amount, and a short description. Optionally a due date. The invoice is SAVED in QBO, not emailed.",
    input_schema: {
      type: 'object',
      properties: {
        customer: { type: 'string', description: 'Customer/client name.' },
        amount: { type: 'number', description: 'Invoice total in USD.' },
        description: { type: 'string', description: 'What the invoice is for (the line description).' },
        due_date: { type: 'string', description: 'YYYY-MM-DD (optional).' },
      },
      required: ['customer', 'amount'],
    },
  },
  {
    name: 'create_bill',
    description:
      "PROPOSE creating a bill in QuickBooks (money PDS owes a vendor/supplier/subcontractor). Does NOT post — asks the user to confirm first. Give the vendor name, the amount, and a short description. Optionally the expense account name (defaults to the first expense account) and a bill number/date.",
    input_schema: {
      type: 'object',
      properties: {
        vendor: { type: 'string', description: 'Vendor name as it appears in QuickBooks; created if new.' },
        amount: { type: 'number', description: 'Bill total in USD.' },
        description: { type: 'string', description: 'What the bill is for (the line description).' },
        account: { type: 'string', description: 'QBO expense account name (optional).' },
        bill_number: { type: 'string', description: 'Bill number to stamp (optional).' },
        bill_date: { type: 'string', description: 'YYYY-MM-DD (optional).' },
        due_date: { type: 'string', description: 'YYYY-MM-DD (optional).' },
      },
      required: ['vendor', 'amount'],
    },
  },
  {
    name: 'update_invoice',
    description:
      "PROPOSE correcting an existing QuickBooks invoice — its DATE and/or its CUSTOMER (never the amount). Does NOT change it — asks the user to confirm first. Check the current values with get_invoices (by number) first. A new customer must already exist in QBO, and an invoice with a payment applied is skipped.",
    input_schema: {
      type: 'object',
      properties: {
        invoice_number: { type: 'string', description: 'The invoice number (QBO DocNumber) to correct.' },
        date: { type: 'string', description: 'New invoice date (YYYY-MM-DD).' },
        due_date: { type: 'string', description: 'New due date (YYYY-MM-DD).' },
        customer: { type: 'string', description: 'New customer name (must match an existing QBO customer).' },
      },
      required: ['invoice_number'],
    },
  },
  {
    name: 'delete_invoices',
    description:
      "PROPOSE deleting duplicate invoices from QuickBooks by their unique ids. Does NOT delete — asks the user to confirm first. Use ONLY after find_duplicate_invoices, passing the EXTRA copies (keep one per number). Paid invoices are ALWAYS skipped. Pass each invoice's id plus its number/customer/amount so the user sees exactly what's being removed. Permanent — be conservative.",
    input_schema: {
      type: 'object',
      properties: {
        invoices: {
          type: 'array',
          description: 'The duplicate invoices to delete (the extra copies).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'QBO invoice id (unique per copy).' },
              number: { type: 'string', description: 'The invoice number (for display).' },
              customer: { type: 'string', description: 'Customer name (for display).' },
              amount: { type: 'number', description: 'Invoice amount (for display).' },
            },
            required: ['id'],
          },
        },
      },
      required: ['invoices'],
    },
  },
  {
    name: 'import_contacts',
    description:
      "PROPOSE importing a batch of contacts into the CRM, then let the user confirm. If the user ATTACHED a CSV/contact sheet you'll see an '[Attached contact sheet: …]' preview — the app already parsed every row, so call import_contacts with an EMPTY contacts array (contacts: []); the app injects the parsed rows. If they PASTED a small list as text, parse it yourself into rows (client + name, plus optional title/email/phone). Each contact attaches to its client (matched by name, created if new). The import is IDEMPOTENT — it only adds the missing ones. Never claim they're imported until the user confirms.",
    input_schema: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          description: 'The contacts to import (leave empty for an attached sheet — the app injects the rows).',
          items: {
            type: 'object',
            properties: {
              company: { type: 'string', description: 'Client the contact works at (matched by name, created if new).' },
              name: { type: 'string' },
              title: { type: 'string' },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            required: ['company', 'name'],
          },
        },
      },
      required: ['contacts'],
    },
  },
];

// UI labels (kept in sync with TOOL_LABELS in AssistantChat.tsx).
export const TOOL_LABELS: Record<string, string> = {
  data_overview: 'Getting oriented',
  list_clients: 'Reading clients',
  get_client: 'Reading client profile',
  list_contacts: 'Reading contacts',
  list_staff: 'Reading the staff roster',
  list_assets: 'Reading assets',
  list_jobs: 'Reading jobs',
  get_job: 'Reading the job',
  list_leads: 'Reading the lead pipeline',
  get_lead: 'Reading the lead',
  client_performance: 'Ranking client performance',
  job_analytics: 'Analyzing the operation',
  get_invoices: 'Reading invoices',
  get_bills: 'Reading bills',
  find_duplicate_invoices: 'Finding duplicate invoices',
  financials: 'Reading the books',
  client_financials: 'Reading client profitability',
  ar_aging: 'Aging receivables',
  cash_flow: 'Building the cash-flow statement',
  cash_calendar: 'Reading the cash calendar',
  refresh_books: 'Checking book freshness',
  save_draft: 'Saving a draft',
  remember: 'Saving to memory',
  build_report: 'Building a report',
  delegate: 'Consulting the team',
  create_client: 'Preparing a new client',
  create_contact: 'Preparing a contact',
  create_asset: 'Preparing an asset',
  create_job: 'Preparing a job',
  update_job: 'Preparing a job update',
  invoice_job: 'Preparing to invoice the job',
  create_invoice: 'Preparing an invoice',
  create_bill: 'Preparing a bill',
  update_invoice: 'Preparing an invoice fix',
  delete_invoices: 'Preparing an invoice cleanup',
  import_contacts: 'Preparing a contact import',
};

// Gated write tools — surfaced to the human for confirmation, never auto-run.
export const ACTION_TOOLS = [
  'create_client',
  'create_contact',
  'create_asset',
  'create_job',
  'update_job',
  'invoice_job',
  'create_invoice',
  'create_bill',
  'update_invoice',
  'delete_invoices',
  'import_contacts',
];

// ---- dispatch ---------------------------------------------------------------

async function dispatch(name: string, input: Json): Promise<unknown> {
  switch (name) {
    case 'data_overview':
      return getDashboardStats();

    case 'list_clients':
      return listClients(typeof input.search === 'string' ? input.search : undefined);

    case 'get_client': {
      const r = await resolveClient(String(input.name ?? ''));
      if (r.error) return r.error;
      const c = r.client!;
      const [full, contacts, assets] = await Promise.all([
        getClient(c.id),
        getClientContacts(c.id),
        getClientAssets(c.id),
      ]);
      return {
        client: full,
        contacts,
        assets: assets.map((a) => ({ id: a.id, label: assetLabel(a), vin: a.vin, mileage: a.mileage })),
      };
    }

    case 'list_contacts':
      return listContacts();

    case 'list_staff':
      return listStaff();

    case 'list_assets':
      return listAssets();

    case 'list_jobs': {
      const status = JOB_STATUSES.includes(input.status as JobStatus) ? (input.status as JobStatus) : undefined;
      let jobs = await listJobs(status);
      if (SERVICE_TYPES.includes(input.service_type as ServiceType)) {
        jobs = jobs.filter((j) => j.service_type === input.service_type);
      }
      return jobs;
    }

    case 'get_job': {
      const id = String(input.id ?? '');
      const [job, report] = await Promise.all([getJob(id), getConditionReport(id)]);
      if (!job) return { error: `No job with id "${id}".` };
      return { job, condition_report: report };
    }

    case 'list_leads':
      return listLeads();

    case 'get_lead': {
      const r = await resolveLead(String(input.lead ?? ''));
      if (r.error) return r.error;
      return { lead: r.lead };
    }

    case 'client_performance':
      return { ranking: await clientPerformance() };

    case 'job_analytics':
      return jobAnalytics();

    case 'get_invoices': {
      const number = typeof input.number === 'string' && input.number.trim() ? input.number.trim() : undefined;
      const res = await getInvoices({ number, openOnly: input.open_only === true, limit: clamp(input.limit, 50, 200) });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      return number
        ? { found: d.found ?? false, invoice: d.invoice ?? null }
        : { count: d.count ?? 0, invoices: d.invoices ?? [] };
    }

    case 'get_bills': {
      const number = typeof input.number === 'string' && input.number.trim() ? input.number.trim() : undefined;
      const res = await getBills({ number, openOnly: input.open_only === true, limit: clamp(input.limit, 50, 200) });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      return number ? { found: d.found ?? false, bill: d.bill ?? null } : { count: d.count ?? 0, bills: d.bills ?? [] };
    }

    case 'financials': {
      const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const res = await getCompanyFinancials({ from: day(input.from) ? input.from : undefined, to: day(input.to) ? input.to : undefined });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      return {
        period: d.period,
        currency: 'USD',
        profit_and_loss: {
          revenue: d.revenue,
          cogs: d.cogs,
          gross_profit: d.grossProfit,
          gross_margin_pct: d.grossMargin,
          operating_expenses: d.operatingExpenses,
          other_income: d.otherIncome,
          other_expense: d.otherExpense,
          net_income: d.netIncome,
          net_margin_pct: d.netMargin,
        },
        cash: { balance: d.cashBalance },
        receivables: { total: d.receivables.total, past_due: d.receivables.pastDue },
        payables: { total: d.payables.total },
        books_as_of: d.asOf,
        source: 'QuickBooks (PDS Logix books of record) — same ledger as the pdslogix.net dashboards',
      };
    }

    case 'client_financials': {
      const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const res = await getCustomerFinancials({ from: day(input.from) ? input.from : undefined, to: day(input.to) ? input.to : undefined });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      return {
        period: d.period,
        currency: 'USD',
        client_count: d.customers.length,
        clients: d.customers.map((c) => ({
          customer: c.customer,
          revenue: c.revenue,
          cogs: c.cogs,
          gross_profit: c.grossProfit,
          operating_expenses: c.operatingExpenses,
          net_income: c.netIncome,
          net_margin_pct: c.netMargin,
        })),
        note: "Per-customer P&L, ranked by revenue. 'Not specified' is overhead not tagged to a client. Names are QuickBooks names ('Parent:Sub' for sub-customers).",
        source: 'QuickBooks (PDS Logix books of record)',
      };
    }

    case 'ar_aging': {
      const res = await getArAging();
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      return {
        as_of: d.asOf || 'today',
        buckets: 'current (≤30d past due), 31-60, 61-90, 90+ days',
        totals: { current: d.totals.current, d31_60: d.totals.d31_60, d61_90: d.totals.d61_90, d90_plus: d.totals.d90_plus, total: d.totals.total },
        clients: d.rows.map((r) => ({
          customer: r.customer,
          current: r.current, d31_60: r.d31_60, d61_90: r.d61_90, d90_plus: r.d90_plus, total: r.total,
        })),
        source: 'QuickBooks A/R aging (PDS Logix books of record)',
      };
    }

    case 'cash_flow': {
      const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const res = await getCashFlowStatement({ from: day(input.from) ? input.from : undefined, to: day(input.to) ? input.to : undefined });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      const top = (lines: { account: string; amount: number }[]) => lines.slice(0, 12).map((l) => ({ account: l.account, amount: l.amount }));
      return {
        period: d.period,
        currency: 'USD',
        method: 'Direct / offset method (same as the pdslogix.net cash-flow dashboard; reconciles to QuickBooks Statement of Cash Flows)',
        operating: d.operating,
        investing: d.investing,
        financing: d.financing,
        ...(d.transfer ? { transfer: d.transfer } : {}),
        net_change_in_cash: d.netChange,
        operating_detail: { money_in: top(d.operatingInflows), money_out: top(d.operatingOutflows) },
        investing_detail: top(d.investingLines),
        financing_detail: top(d.financingLines),
        note: 'Positive = cash in, negative = cash out. Bank-to-bank transfers net to zero. Absolute cash balance isn’t shown here — the ledger predates some accounts’ opening balances — but the period cash movement is exact.',
        source: 'QuickBooks (PDS Logix books of record)',
      };
    }

    case 'cash_calendar': {
      const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const res = await getCashFlow({ from: day(input.from) ? input.from : undefined, to: day(input.to) ? input.to : undefined });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      const cap = 30;
      return {
        window: d.from || d.to ? { from: d.from || null, to: d.to || null } : 'all open items',
        summary: { due_in: d.summary.dueIn, owed_out: d.summary.owedOut, net_expected: d.summary.net },
        due_receivables: d.dueReceivables.slice(0, cap),
        payables_out: d.payables.slice(0, cap),
        counts: { receivables: d.dueReceivables.length, payables: d.payables.length },
        note: 'Forward view of open A/R (money due in) and A/P (money owed out) by due date. For overdue-by-age use ar_aging.',
        source: 'QuickBooks (PDS Logix books of record)',
      };
    }

    case 'refresh_books': {
      const res = await getBooksFreshness();
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      return {
        books_as_of: res.data.asOf,
        ledger_lines: res.data.lineCount,
        message: 'The books are synced from QuickBooks automatically on the I AM CFO side. This is the latest data available now.',
      };
    }

    case 'find_duplicate_invoices': {
      const res = await getDuplicateInvoices();
      if (res.status === 'not_configured') return NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const shaped = res.data.groups.map((g) => {
        const sorted = [...g.invoices].sort((a, b) => ((a.txnDate ?? '') < (b.txnDate ?? '') ? -1 : 1));
        const keep = sorted.find((i) => i.paid) ?? sorted[0];
        const deletable = sorted.filter((i) => i.id !== keep.id && !i.paid);
        return { number: g.docNumber, count: g.count, keep, delete_candidates: deletable };
      });
      return {
        duplicate_numbers: shaped.length,
        deletable_extras: shaped.reduce((s, g) => s + g.delete_candidates.length, 0),
        note: 'To remove them, propose delete_invoices with the delete_candidates (their ids). One invoice per number is kept; paid copies are never deleted.',
        groups: shaped,
      };
    }

    case 'save_draft': {
      const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
      const body = typeof input.body === 'string' ? input.body.trim() : '';
      if (!subject || !body) return { error: 'A draft needs both a subject and a body.' };
      const kind: DraftKind = ['follow_up', 'quote', 'reply', 'other'].includes(input.kind as string)
        ? (input.kind as DraftKind)
        : 'other';
      let lead_id: string | null = null;
      let to_name = typeof input.to_name === 'string' ? input.to_name : null;
      let to_email = typeof input.to_email === 'string' ? input.to_email : null;
      if (input.lead) {
        const lr = await resolveLead(String(input.lead));
        if (lr.lead) {
          lead_id = lr.lead.id;
          to_name = to_name ?? lr.lead.name;
          to_email = to_email ?? lr.lead.email;
        }
      }
      let client_id: string | null = null;
      if (input.client) {
        const cr = await resolveClient(String(input.client));
        if (cr.client) {
          client_id = cr.client.id;
          to_email = to_email ?? cr.client.billing_email;
        }
      }
      const saved = await createAssistantDraft({ kind, subject, body, to_name, to_email, lead_id, client_id });
      if ('error' in saved) return saved;
      return {
        saved: true,
        id: saved.id,
        message: 'Draft saved. It is on the Drafts review page — nothing was sent.',
        review_url: '/crm/assistant/drafts',
        to_name,
        to_email,
        subject,
      };
    }

    case 'remember': {
      const content = typeof input.content === 'string' ? input.content.trim() : '';
      if (!content) return { error: 'Nothing to remember — content was empty.' };
      const category: MemoryCategory = ['business', 'client', 'operations', 'preference', 'general'].includes(input.category as string)
        ? (input.category as MemoryCategory)
        : 'general';
      let client_id: string | null = null;
      let subject = typeof input.subject === 'string' ? input.subject : null;
      if (input.client) {
        const cr = await resolveClient(String(input.client));
        if (cr.client) {
          client_id = cr.client.id;
          subject = subject ?? cr.client.name;
        }
      }
      const saved = await createAssistantMemory({ content, category, subject, client_id });
      if ('error' in saved) return saved;
      return { remembered: true, id: saved.id, content, message: "Saved. I'll remember this next time too." };
    }

    case 'build_report': {
      const normalized = normalizeReportInput(input);
      if ('error' in normalized) return normalized;
      const saved = await createAssistantReport(normalized);
      if ('error' in saved) return saved;
      return {
        saved: true,
        id: saved.id,
        url: `/crm/assistant/reports/${saved.id}`,
        message: 'Report built and saved. Share the link or open it under Reports.',
        title: normalized.title,
        blocks: normalized.blocks.length,
      };
    }

    case 'delegate': {
      const specialist = String(input.specialist ?? '');
      const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
      if (!SPECIALIST_KEYS.includes(specialist)) return { error: `Unknown specialist. Options: ${SPECIALIST_KEYS.join(', ')}.` };
      if (!brief) return { error: 'Give the specialist a self-contained brief.' };
      const registry = { tools: ASSISTANT_TOOLS.filter((t) => t.name !== 'delegate'), run: runAssistantTool };
      return runSpecialist(specialist, brief, registry);
    }

    // Gated write tools never run here — the loop intercepts them as proposals.
    // If one reaches dispatch, refuse rather than act.
    case 'create_client':
    case 'create_contact':
    case 'create_asset':
    case 'create_job':
    case 'update_job':
    case 'invoice_job':
    case 'create_invoice':
    case 'create_bill':
    case 'update_invoice':
    case 'delete_invoices':
    case 'import_contacts':
      return { error: 'This action must be confirmed by the user; it cannot run directly.' };

    default:
      return { error: `Unknown tool "${name}".` };
  }
}

export async function runAssistantTool(name: string, input: unknown): Promise<string> {
  try {
    const result = await dispatch(name, (input as Json) ?? {});
    return JSON.stringify(result);
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Tool failed.' });
  }
}
