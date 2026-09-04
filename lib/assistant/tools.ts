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
  productionSummary,
} from '@/lib/crm/data';
import {
  listReconBatches,
  reconExceptions,
  reconSummary,
  resolveReconBatch,
  type ReconStatus,
} from '@/lib/crm/recon';
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
  getAccountBreakdown,
  getArAging,
  getBooksFreshness,
  getCashFlow,
  getCashFlowStatement,
  getCompanyFinancials,
  getCustomerFinancials,
  getFinancialsTrend,
  type Granularity,
} from '@/lib/integrations/pdsbooks';
import { buildCashForecast } from '@/lib/crm/forecast';
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

// A YYYY-MM-DD date from tool input, or undefined. Anything else is dropped
// rather than passed on, so a bad filter never silently matches nothing.
function dateArg(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : undefined;
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
    name: 'production',
    description:
      "PRODUCTION VOLUME — the count of units serviced (condition reports and photo sets) logged at auction/dealer locations, broken down by location, service type, person, month, and day. Use for 'how many units did we do', 'production at Manheim Dallas', 'who's our most productive tech', 'volume by service type', or a productivity report. This is OPERATIONAL VOLUME (units), distinct from the books (dollars) and from CRM jobs — pair it with client_financials to get revenue-per-unit. Scope with location (e.g. 'Manheim Dallas') and/or from/to (YYYY-MM-DD); omit for everything on record.",
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: "Location name, e.g. 'Manheim Dallas' (optional; omit for all)." },
        from: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
      },
    },
  },
  {
    name: 'list_recon_batches',
    description:
      'The car-count reconciliations on file (newest first): label, counterparty (usually Manheim), location, period, which files are loaded, and how many units are on each side. Use it to see what has been uploaded, or when someone names a reconciliation you need the id for.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'car_count_recon',
    description:
      "CAR COUNT RECONCILIATION — our unit count vs the auction's (Manheim). Someone uploads their statement/unit list on the Car Count Recon page (/crm/recon); this tool reads the finished match. Returns both counts, the variance (ours − theirs), how many matched by VIN, and the two exception buckets: only_theirs (they billed/listed a unit we never logged — usually a missed log or work we're not getting credit for internally) and only_ours (we logged it but it's not on their list — chase it for payment), plus the dollars on their side, and the day / location / service breakdown that shows where the gap opened. Matching is by VIN (last 6, duplicates counted), so a variance is real units, not rounding. Omit `batch` for the most recent reconciliation, or name one ('Manheim Dallas March'). Set `show` to pull the actual rows in a bucket (default only_theirs) and `limit` for how many. If nothing has been uploaded yet, say so and point them to /crm/recon — you cannot upload the file yourself.",
    input_schema: {
      type: 'object',
      properties: {
        batch: { type: 'string', description: 'Which reconciliation — a label like "Manheim Dallas · March" or its id. Omit for the most recent.' },
        show: { type: 'string', enum: ['only_theirs', 'only_ours', 'no_vin', 'matched', 'none'], description: "Which rows to include with the summary (default 'only_theirs'; 'none' for the scorecard alone)." },
        limit: { type: 'number', description: 'How many rows to return (default 25, max 200).' },
      },
    },
  },
  {
    name: 'import_car_count',
    description:
      "GATED ACTION — load a car-count file the person just attached to this chat and run the reconciliation on it. Use it ONLY when the app has shown you an '[Attached car count: …]' preview; that preview means the file is parsed and waiting, so call this with NO units of your own (the app sends the file itself). Set `side` to 'theirs' for the auction's list (the default) or 'ours' for our own count file. Fill in `location` when you know which of our locations the file covers (it scopes our side of the match) and `counterparty` when it isn't Manheim; `label` names the reconciliation. Like every action it only runs when the person clicks Confirm — after they do, the card shows both counts and the variance, and you can call car_count_recon for the detail.",
    input_schema: {
      type: 'object',
      properties: {
        side: { type: 'string', enum: ['theirs', 'ours'], description: "Whose count the file is (default 'theirs' — the auction's list)." },
        counterparty: { type: 'string', description: "Who the file came from (default 'Manheim')." },
        location: { type: 'string', description: "Our location the file covers, e.g. 'Manheim Dallas' — scopes our side of the match." },
        label: { type: 'string', description: 'Name for this reconciliation, e.g. "Manheim Dallas · March".' },
        period_start: { type: 'string', description: 'Start of the period, YYYY-MM-DD (optional — inferred from the file).' },
        period_end: { type: 'string', description: 'End of the period, YYYY-MM-DD (optional — inferred from the file).' },
      },
    },
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
      'SEE invoices from QuickBooks — dates, due dates, amounts, balances (paid vs open), customers, and when each was ENTERED in QuickBooks. Pass a specific `number` to pull one, or omit it to list newest-first (set open_only for just the unpaid ones). Use created_from/created_to to answer "what was entered/booked in August?" — it filters on the entry date, so it CATCHES an invoice dated in July but keyed in during August, which a question about invoice dates would miss. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'A specific invoice number to look up (optional).' },
        open_only: { type: 'boolean', description: 'When listing, only invoices with an outstanding balance.' },
        limit: { type: 'number', description: 'Max invoices to list (default 50, max 200).' },
        created_from: { type: 'string', description: 'YYYY-MM-DD. Only invoices ENTERED in QuickBooks on/after this date — regardless of the date on the invoice.' },
        created_to: { type: 'string', description: 'YYYY-MM-DD, inclusive of the whole day. Only invoices ENTERED in QuickBooks on/before this date.' },
      },
    },
  },
  {
    name: 'get_bills',
    description:
      'SEE bills from QuickBooks (money PDS owes vendors/suppliers) — vendor, dates, amounts, balances, and when each was ENTERED in QuickBooks. Pass a specific `number`, or omit to list newest-first (open_only for unpaid). Use created_from/created_to for "what was entered in August?" — it catches a July-dated bill keyed in during August. Read-only.',
    input_schema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'A specific bill number to look up (optional).' },
        open_only: { type: 'boolean', description: 'When listing, only unpaid bills.' },
        limit: { type: 'number', description: 'Max bills to list (default 50, max 200).' },
        created_from: { type: 'string', description: 'YYYY-MM-DD. Only bills ENTERED in QuickBooks on/after this date — regardless of the date on the bill.' },
        created_to: { type: 'string', description: 'YYYY-MM-DD, inclusive of the whole day. Only bills ENTERED in QuickBooks on/before this date.' },
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
    name: 'financials_trend',
    description:
      "P&L over TIME — the books sliced into a series of periods so you can trend or compare. Set granularity to 'month', 'quarter', or 'year'; each period returns revenue, COGS, gross profit, operating expenses, net income, and margins. THIS is how you build a year-by-month P&L, a quarterly comparison, or a revenue/net trend line — one call gives the whole series (feed it to build_report as a line or bar chart). Optionally filter to one client with `customer`, or set group_by_customer=true to also get each period broken down per client (revenue + net) for a stacked/grouped comparison. Scope the span with from/to (YYYY-MM-DD); omit for the current calendar year. Every period reconciles to financials/pnl_by_account for the same window.",
    input_schema: {
      type: 'object',
      properties: {
        granularity: { type: 'string', enum: ['month', 'quarter', 'year'], description: "Period size (default 'month')." },
        from: { type: 'string', description: 'Span start YYYY-MM-DD (optional; default Jan 1 of the current year).' },
        to: { type: 'string', description: 'Span end YYYY-MM-DD (optional; default Dec 31 of the current year).' },
        customer: { type: 'string', description: 'Optional: trend just this client (QuickBooks customer name; matches sub-customers).' },
        group_by_customer: { type: 'boolean', description: 'Optional: also return each period split by client (revenue + net) for a per-client comparison over time.' },
      },
    },
  },
  {
    name: 'pnl_by_account',
    description:
      "The ITEMIZED profit & loss — every income and expense ACCOUNT with its amount for the period, grouped Income / Cost of Goods Sold / Expense / Other, with subtotals (revenue, gross profit, operating expenses, net income). This is the line-item P&L detail (e.g. Condition Reports, Detail Services, Photography, Contractors & Payroll, Travel:Hotel), matching QuickBooks' P&L to the penny; sub-accounts read as 'Parent:Sub'. Use for 'itemized P&L', 'break the P&L down by account', 'what are we spending on', 'biggest expenses', or a detailed income-statement report. Optionally scope to ONE client with `customer` (the QuickBooks customer name, e.g. from client_financials) for that client's itemized P&L. Scope the period with from/to (YYYY-MM-DD); omit for the current month.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Period start YYYY-MM-DD (optional).' },
        to: { type: 'string', description: 'Period end YYYY-MM-DD (optional).' },
        customer: { type: 'string', description: 'Optional: itemize just this client (QuickBooks customer name; matches sub-customers too).' },
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
    name: 'cash_forecast',
    description:
      "FORWARD CASH FORECAST — projects the bank balance week by week starting from last Friday's end-of-day cash (live from Plaid when a bank is connected, otherwise the books' cash), then rolls in real open invoices (A/R) on their due dates and rolls out A/P plus PAYROLL on each upcoming A/B Friday payday. Payroll accrues LIVE from clock-ins and production — the current period's payday grows as the crew works ('accruing'), future paydays use the last period's run rate ('projected'). Use for 'what's our cash going to look like', 'will we make payroll Friday', 'when's our tightest week', 'cash runway', or a cash-forecast report. Returns the starting anchor, each week's money-in / money-out / payroll / net / projected ending balance, the projected low point, and the biggest drivers. Set weeks (default 8; 13 for a quarter). This is the forward projection — for actual historical cash movement use cash_flow; for the raw open-items list use cash_calendar.",
    input_schema: { type: 'object', properties: { weeks: { type: 'number', description: 'Weeks forward (default 8, e.g. 13 for a quarter).' } } },
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
  {
    name: 'import_staff',
    description:
      "PROPOSE importing team members (staff) into the CRM from a Connecteam-style people export, then let the user confirm. If they ATTACHED a team/people sheet you'll see an '[Attached team sheet: …]' preview — the app already parsed every row, so call import_staff with an EMPTY staff array (staff: []); the app injects the rows. If they PASTED a short list, parse it yourself (name required; optional title, email, phone, active). IDEMPOTENT — only new people are added, matched by name/email. Never claim they're imported until the user confirms.",
    input_schema: {
      type: 'object',
      properties: {
        staff: {
          type: 'array',
          description: 'The team members to import (leave empty for an attached sheet — the app injects the rows).',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              title: { type: 'string', description: 'Role / job title (optional).' },
              email: { type: 'string' },
              phone: { type: 'string' },
              active: { type: 'boolean', description: 'Whether they are currently active (default true).' },
            },
            required: ['name'],
          },
        },
      },
      required: ['staff'],
    },
  },
  {
    name: 'import_time',
    description:
      "PROPOSE importing worked hours / time-clock shifts from a Connecteam-style time export, then let the user confirm. If they ATTACHED a time sheet you'll see an '[Attached time sheet: …]' preview — the app already parsed every row, so call import_time with an EMPTY entries array (entries: []); the app injects the rows. Each shift links to a team member by name (created if missing). A shift has an employee plus either clock in + clock out, or a date + total hours. IDEMPOTENT — deduped by employee + start time. Never claim they're imported until the user confirms.",
    input_schema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          description: 'The shifts to import (leave empty for an attached sheet — the app injects the rows).',
          items: {
            type: 'object',
            properties: {
              employee: { type: 'string', description: 'Staff member name (matched, created if new).' },
              date: { type: 'string', description: 'Shift date (e.g. 2026-07-15 or 07/15/2026).' },
              clock_in: { type: 'string', description: 'Clock-in time or datetime (optional if hours given).' },
              clock_out: { type: 'string', description: 'Clock-out time or datetime (optional if hours given).' },
              hours: { type: 'string', description: 'Total hours worked (used when clock times are absent).' },
              notes: { type: 'string', description: 'Job / shift note (optional).' },
            },
            required: ['employee'],
          },
        },
      },
      required: ['entries'],
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
  production: 'Counting production volume',
  list_recon_batches: 'Listing reconciliations',
  car_count_recon: 'Reconciling the car count',
  import_car_count: 'Preparing a car-count import',
  job_analytics: 'Analyzing the operation',
  get_invoices: 'Reading invoices',
  get_bills: 'Reading bills',
  find_duplicate_invoices: 'Finding duplicate invoices',
  financials: 'Reading the books',
  client_financials: 'Reading client profitability',
  pnl_by_account: 'Itemizing the P&L by account',
  financials_trend: 'Trending the P&L over time',
  ar_aging: 'Aging receivables',
  cash_flow: 'Building the cash-flow statement',
  cash_calendar: 'Reading the cash calendar',
  cash_forecast: 'Forecasting cash',
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
  import_staff: 'Preparing a team import',
  import_time: 'Preparing an hours import',
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
  'import_staff',
  'import_time',
  'import_car_count',
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

    case 'production': {
      const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const location = typeof input.location === 'string' && input.location.trim() ? input.location.trim() : undefined;
      const s = await productionSummary({ location, from: day(input.from) ? input.from : undefined, to: day(input.to) ? input.to : undefined });
      return {
        total_units: s.total_units,
        date_from: s.date_from,
        date_to: s.date_to,
        by_location: s.locations,
        by_service_type: s.by_service,
        by_person: s.by_staff.slice(0, 40),
        by_month: s.by_month,
        note: 'Units serviced (condition reports & photo sets). Operational volume, not dollars — pair with client_financials for revenue per unit.',
        source: 'Production log (Connecteam entries)',
      };
    }

    case 'list_recon_batches': {
      const batches = await listReconBatches();
      return {
        count: batches.length,
        batches: batches.map((b) => ({
          id: b.id,
          label: b.label,
          counterparty: b.counterparty,
          location: b.location,
          period: b.period_start ? `${b.period_start} → ${b.period_end ?? '…'}` : null,
          their_units_loaded: b.theirs_rows,
          our_units_uploaded: b.ours_rows,
          our_side: b.ours_rows > 0 ? 'uploaded file' : 'production log',
          uploaded_at: b.created_at,
        })),
        note: batches.length ? undefined : 'Nothing uploaded yet — the team loads the auction file on /crm/recon.',
      };
    }

    case 'car_count_recon': {
      const r = await resolveReconBatch(typeof input.batch === 'string' ? input.batch : undefined);
      if (r.error) return { error: r.error, available: r.candidates };
      const batch = r.batch!;
      const s = await reconSummary(batch.id);

      const showRaw = typeof input.show === 'string' ? input.show : 'only_theirs';
      const show = ['only_theirs', 'only_ours', 'no_vin', 'matched', 'none'].includes(showRaw) ? showRaw : 'only_theirs';
      const limit = clamp(input.limit, 25, 200);
      const detail =
        show === 'none'
          ? null
          : await reconExceptions({ batchId: batch.id, status: show as ReconStatus, limit });

      return {
        reconciliation: batch.label,
        counterparty: batch.counterparty,
        location: batch.location ?? 'all locations',
        period: `${s.date_from ?? batch.period_start ?? '?'} → ${s.date_to ?? batch.period_end ?? '?'}`,
        our_units: s.ours_units,
        our_side_source: s.ours_source === 'production_log' ? 'the production log' : 'an uploaded count file',
        their_units: s.theirs_units,
        variance_ours_minus_theirs: s.variance,
        matched_units: s.matched_units,
        match_rate_pct: s.match_rate,
        only_on_their_list: s.only_theirs,
        only_on_our_list: s.only_ours,
        rows_without_vin: { ours: s.no_vin_ours, theirs: s.no_vin_theirs },
        their_charges_total: s.their_amount_total,
        their_charges_on_unmatched: s.amount_only_theirs,
        by_day: s.by_day,
        by_location: s.by_location,
        by_service: s.by_service,
        rows: detail ? { bucket: show, count: detail.count, showing: detail.rows.length, units: detail.rows } : undefined,
        other_reconciliations: r.candidates,
        note: 'Matched VIN by VIN (last 6, duplicates counted). only_theirs = they listed a unit we never logged; only_ours = we logged one that is not on their list. Rows without a VIN can’t be matched either way — call them out separately rather than treating them as a gap.',
        source: `Car count recon · ${batch.counterparty} file vs ${s.ours_source === 'production_log' ? 'our production log' : 'our uploaded count'}`,
      };
    }

    case 'get_invoices': {
      const number = typeof input.number === 'string' && input.number.trim() ? input.number.trim() : undefined;
      const createdFrom = dateArg(input.created_from);
      const createdTo = dateArg(input.created_to);
      const res = await getInvoices({
        number,
        openOnly: input.open_only === true,
        limit: clamp(input.limit, 50, 200),
        createdFrom,
        createdTo,
      });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      // Name the clock the list was filtered on, so "entered in August" is
      // never read back as "dated in August".
      const basis = createdFrom || createdTo
        ? { basis: 'entered in QuickBooks', createdFrom, createdTo }
        : {};
      return number
        ? { found: d.found ?? false, invoice: d.invoice ?? null }
        : { count: d.count ?? 0, ...basis, invoices: d.invoices ?? [] };
    }

    case 'get_bills': {
      const number = typeof input.number === 'string' && input.number.trim() ? input.number.trim() : undefined;
      const createdFrom = dateArg(input.created_from);
      const createdTo = dateArg(input.created_to);
      const res = await getBills({
        number,
        openOnly: input.open_only === true,
        limit: clamp(input.limit, 50, 200),
        createdFrom,
        createdTo,
      });
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      const basis = createdFrom || createdTo
        ? { basis: 'entered in QuickBooks', createdFrom, createdTo }
        : {};
      return number
        ? { found: d.found ?? false, bill: d.bill ?? null }
        : { count: d.count ?? 0, ...basis, bills: d.bills ?? [] };
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

    case 'financials_trend': {
      const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const gran: Granularity = input.granularity === 'quarter' || input.granularity === 'year' ? input.granularity : 'month';
      const customer = typeof input.customer === 'string' && input.customer.trim() ? input.customer.trim() : undefined;
      const groupByCustomer = input.group_by_customer === true;
      const res = await getFinancialsTrend(
        { from: day(input.from) ? input.from : undefined, to: day(input.to) ? input.to : undefined },
        gran,
        { customer, groupByCustomer },
      );
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      return {
        granularity: d.granularity,
        from: d.from, to: d.to,
        ...(d.customer ? { customer: d.customer } : {}),
        currency: 'USD',
        periods: d.periods.map((p) => ({
          period: p.period,
          revenue: p.revenue,
          cogs: p.cogs,
          gross_profit: p.grossProfit,
          operating_expenses: p.operatingExpenses,
          net_income: p.netIncome,
          net_margin_pct: p.netMargin,
        })),
        ...(d.byCustomer ? { by_customer: d.byCustomer.map((b) => ({ period: b.period, clients: b.customers.map((c) => ({ customer: c.customer, revenue: c.revenue, net_income: c.netIncome })) })) } : {}),
        note: 'Each period reconciles to financials/pnl_by_account for that window. Feed this to build_report (line for trends, bar for period comparison).',
        source: 'QuickBooks (PDS Logix books of record)',
      };
    }

    case 'pnl_by_account': {
      const day = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const customer = typeof input.customer === 'string' && input.customer.trim() ? input.customer.trim() : undefined;
      const res = await getAccountBreakdown({ from: day(input.from) ? input.from : undefined, to: day(input.to) ? input.to : undefined }, customer);
      if (res.status === 'not_configured') return BOOKS_NOT_CONFIGURED;
      if (res.status === 'error') return { error: res.message };
      const d = res.data;
      const s = d.subtotals;
      return {
        period: d.period,
        currency: 'USD',
        ...(d.customer ? { customer: d.customer } : {}),
        income: d.income,
        cost_of_goods_sold: d.costOfGoodsSold,
        expenses: d.expenses,
        ...(d.otherIncome.length ? { other_income: d.otherIncome } : {}),
        ...(d.otherExpense.length ? { other_expense: d.otherExpense } : {}),
        subtotals: {
          revenue: s.revenue,
          cogs: s.cogs,
          gross_profit: s.grossProfit,
          gross_margin_pct: s.grossMargin,
          operating_expenses: s.operatingExpenses,
          net_income: s.netIncome,
          net_margin_pct: s.netMargin,
        },
        note: "Itemized P&L; every account nets to the subtotals. Amounts are period totals per account (sub-accounts as 'Parent:Sub'). Matches QuickBooks' P&L detail.",
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
      const top = (lines: { account: string; amount: number }[]) => lines.slice(0, 100).map((l) => ({ account: l.account, amount: l.amount }));
      return {
        period: d.period,
        currency: 'USD',
        method: 'Direct / offset method (same as the pdslogix.net cash-flow dashboard; reconciles to QuickBooks Statement of Cash Flows)',
        operating: d.operating,
        investing: d.investing,
        financing: d.financing,
        ...(d.transfer ? { transfer: d.transfer } : {}),
        net_change_in_cash: d.netChange,
        ...(d.cashAtBeginning != null ? { cash_at_beginning: d.cashAtBeginning, cash_at_end: d.cashAtEnd } : {}),
        operating_detail: { money_in: top(d.operatingInflows), money_out: top(d.operatingOutflows) },
        investing_detail: top(d.investingLines),
        financing_detail: top(d.financingLines),
        note: d.cashAtBeginning != null
          ? 'Positive = cash in, negative = cash out. Bank-to-bank transfers net to zero. Cash at beginning/end is anchored to QuickBooks’ known cash balance and rolled forward with exact ledger movement.'
          : 'Positive = cash in, negative = cash out. Bank-to-bank transfers net to zero. Absolute cash balance isn’t shown for periods before the cash anchor; the period cash movement is exact.',
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

    case 'cash_forecast': {
      const weeks = clamp(input.weeks, 8, 26);
      const f = await buildCashForecast({ weeks });
      const last = f.weeks[f.weeks.length - 1];
      return {
        anchor: { as_of_friday: f.anchor.date, balance: f.anchor.balance, source: f.anchor.source },
        horizon_weeks: f.horizonWeeks,
        projected_low_point: { week_ending: f.lowPoint.weekEnd, balance: f.lowPoint.balance },
        total_in: f.totalIn,
        total_out: f.totalOut,
        ending_balance: last ? last.endingBalance : f.anchor.balance,
        weeks: f.weeks.map((w) => ({ week_ending: w.weekEnd, money_in: w.inflow, money_out: w.outflow, payroll: w.payroll, net: w.net, ending_balance: w.endingBalance })),
        payroll_paydays: f.weeks.flatMap((w) => w.items.filter((i) => i.kind === 'payroll').map((i) => ({ payday: i.date, amount: i.amount, basis: i.basis, group: i.label }))),
        top_receivables: f.weeks.flatMap((w) => w.items.filter((i) => i.kind === 'ar')).sort((a, b) => b.amount - a.amount).slice(0, 8).map((i) => ({ customer: i.label, amount: i.amount, due: i.date })),
        note: "Starts from last Friday's EOD cash (Plaid live when connected, locked weekly, rolling to the new Friday on Saturday). Payroll 'accruing' grows with clock-ins/production; 'projected' uses last period's run rate. A negative ending balance = a cash gap that week.",
        source: 'PDS Logix — bank (Plaid) + QuickBooks books + live payroll',
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
    case 'import_staff':
    case 'import_time':
    case 'import_car_count':
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
