// PDS Logix books — read the real financial ledger (server-only).
//
// PDS's QuickBooks data is synced into the "PDS Logix" I AM CFO data warehouse
// (a Supabase project) as a flat `journal_entry_lines` table — the exact same
// mirror the pdslogix.net dashboards read from. This module reads it directly so
// Zordon can pull the SAME numbers the dashboards show, plus per-customer
// breakdowns the dashboards compute, and turn them into varied reports.
//
// We replicate QBO's own report math so our totals match QuickBooks:
//   1. Non-posting transactions (Estimates, Sales/Purchase Orders, Pending
//      invoices) are excluded — entry-aware, so both halves of a split entry
//      drop together (see filterPosting below, ported from the tenant app's
//      qboFilters.ts).
//   2. The P&L is sectioned Income / COGS / Expense / Other Income / Other
//      Expense exactly as QBO subtotals it.
//
// Reads only. Writes (posting invoices/bills) still go through the I AM CFO
// partner API against the live QBO connection — see lib/integrations/iamcfo.ts.
//
// Config (server-only):
//   PDS_BOOKS_SUPABASE_URL   the data-warehouse URL (…​.supabase.co)
//   PDS_BOOKS_SUPABASE_KEY   a key that can read the finance tables
//   PDS_BOOKS_ORG_ID         optional; scope to one org (defaults to all rows,
//                            since this warehouse holds a single company)

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.PDS_BOOKS_SUPABASE_URL;
const KEY = process.env.PDS_BOOKS_SUPABASE_KEY;
const ORG_ID = process.env.PDS_BOOKS_ORG_ID; // optional single-org scope

export function booksConfigured(): boolean {
  return Boolean(URL && KEY);
}

let _client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!_client) {
    _client = createClient(URL!, KEY!, { auth: { persistSession: false } });
  }
  return _client;
}

export type BooksResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

// ---- QBO-faithful helpers (ported from the tenant app's qboFilters.ts) ------

const NON_POSTING = new Set(['estimate', 'sales order', 'purchase order', 'pending invoice', 'pending sale']);

interface RawLine {
  entry_number: string | null;
  customer: string | null;
  account_type: string | null;
  debit: number | null;
  credit: number | null;
  posting: string | null;
  type: string | null;
  date?: string | null;
}

const isPosting = (r: { posting?: string | null; type?: string | null }): boolean => {
  if (r.posting === 'No') return false;
  const t = (r.type ?? '').toString().toLowerCase().trim();
  if (t && NON_POSTING.has(t)) return false;
  return true;
};

// Drop every line sharing an entry_number with any non-posting line, so a split
// entry (e.g. an Estimate whose income leg is a legacy untagged row) nets to zero
// instead of inflating revenue — matching QBO's P&L exactly.
function filterPosting<T extends RawLine>(rows: T[]): T[] {
  const bad = new Set<string>();
  for (const r of rows) {
    if (r.entry_number && !isPosting(r)) bad.add(r.entry_number);
  }
  return rows.filter((r) => isPosting(r) && !(r.entry_number && bad.has(r.entry_number)));
}

type Bucket = 'INCOME' | 'OTHER_INCOME' | 'COGS' | 'EXPENSE' | 'OTHER_EXPENSE' | null;
function bucket(accountType: string | null): Bucket {
  const t = (accountType ?? '').toLowerCase();
  if (t === 'other income') return 'OTHER_INCOME';
  if (t === 'other expense') return 'OTHER_EXPENSE';
  if (t === 'cost of goods sold' || t === 'cogs') return 'COGS';
  if (t === 'income' || t.includes('income') || t.includes('revenue')) return 'INCOME';
  if (t === 'expenses' || t.includes('expense')) return 'EXPENSE';
  return null;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- period handling --------------------------------------------------------

function monthRange(d: Date): { from: string; to: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

function periodLabel(from: string, to: string): string {
  const s = new Date(`${from}T00:00:00Z`);
  const e = new Date(`${to}T00:00:00Z`);
  const monthYear = (x: Date) => x.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fullDate = (x: Date) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const sameMonth = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth();
  const lastOfMonth = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate();
  const isFullMonth = sameMonth && s.getUTCDate() === 1 && e.getUTCDate() === lastOfMonth;
  // A full calendar month reads as "July 2026"; a partial month or any other
  // span reads as exact dates ("Jul 1–28, 2026", "Jan 1, 2026 – Jun 30, 2026")
  // so a period is never mistaken for one the owner ran in QuickBooks.
  if (isFullMonth) return monthYear(s);
  if (sameMonth) {
    const mo = s.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${mo} ${s.getUTCDate()}–${e.getUTCDate()}, ${e.getUTCFullYear()}`;
  }
  return `${fullDate(s)} – ${fullDate(e)}`;
}

// Page through a filtered select (Supabase caps a response at 1000 rows).
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<RawLine[]> {
  const page = 1000;
  const out: RawLine[] = [];
  for (let i = 0; ; i += page) {
    const { data, error } = await build(i, i + page - 1);
    if (error) throw new Error((error as { message?: string })?.message ?? 'query failed');
    const rows = (data ?? []) as RawLine[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

// Optionally pin a query to one org. Typed loosely on purpose: the PostgREST
// builder's generic types are too deep to thread through here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoped(q: any): any {
  return ORG_ID ? q.eq('organization_id', ORG_ID) : q;
}

// Pull the P&L-relevant lines (income + expense sections) for a window.
async function fetchPLLines(from: string, to: string): Promise<RawLine[]> {
  return fetchAll((lo, hi) =>
    scoped(
      db()
        .from('journal_entry_lines')
        .select('entry_number,customer,account_type,debit,credit,posting,type'),
    )
      .gte('date', from)
      .lte('date', to)
      .range(lo, hi),
  );
}

// The latest month that actually has ledger activity — so an empty current month
// never reports a misleading all-zero P&L.
async function latestMonth(): Promise<{ from: string; to: string } | null> {
  const { data } = await scoped(db().from('journal_entry_lines').select('date'))
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const d = (data as { date?: string } | null)?.date;
  return d ? monthRange(new Date(`${d}T00:00:00Z`)) : null;
}

// ---- shapes -----------------------------------------------------------------

export interface PnL {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  otherIncome: number;
  otherExpense: number;
  netIncome: number;
  grossMargin: number; // %
  netMargin: number; // %
}

export interface CompanyFinancials extends PnL {
  period: string;
  from: string;
  to: string;
  cashBalance: number;
  receivables: { total: number; pastDue: number };
  payables: { total: number };
  asOf: string; // latest ledger date in the warehouse
}

export interface CustomerPnL extends PnL {
  customer: string;
}

// Sum a set of lines into a P&L, using QBO's credit/debit conventions per section.
function foldPnL(lines: RawLine[]): PnL {
  let revenue = 0, cogs = 0, opex = 0, otherIncome = 0, otherExpense = 0;
  for (const l of lines) {
    const d = num(l.debit), c = num(l.credit);
    switch (bucket(l.account_type)) {
      case 'INCOME': revenue += c - d; break;
      case 'OTHER_INCOME': otherIncome += c - d; break;
      case 'COGS': cogs += d - c; break;
      case 'EXPENSE': opex += d - c; break;
      case 'OTHER_EXPENSE': otherExpense += d - c; break;
      default: break;
    }
  }
  const grossProfit = revenue - cogs;
  const netIncome = grossProfit - opex + otherIncome - otherExpense;
  return {
    revenue: round2(revenue),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    operatingExpenses: round2(opex),
    otherIncome: round2(otherIncome),
    otherExpense: round2(otherExpense),
    netIncome: round2(netIncome),
    grossMargin: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
    netMargin: revenue > 0 ? round2((netIncome / revenue) * 100) : 0,
  };
}

// ---- public reads -----------------------------------------------------------

// Company-level P&L for a period + point-in-time cash / A/R / A/P. Mirrors the
// pdslogix.net overview. Defaults to the current month, falling back to the most
// recent month with activity.
export async function getCompanyFinancials(range?: { from?: string; to?: string }): Promise<BooksResult<CompanyFinancials>> {
  if (!booksConfigured()) return { status: 'not_configured' };
  try {
    let from = range?.from, to = range?.to;
    if (!from || !to) {
      const r = monthRange(new Date());
      from = from ?? r.from;
      to = to ?? r.to;
    }
    let lines = filterPosting(await fetchPLLines(from, to));
    if (lines.length === 0 && !range?.from && !range?.to) {
      const lm = await latestMonth();
      if (lm) { from = lm.from; to = lm.to; lines = filterPosting(await fetchPLLines(from, to)); }
    }
    const pnl = foldPnL(lines);

    // Cash on hand: net of all cash/bank accounts, all-time (a balance, not a flow).
    const cashLines = await fetchAll((lo, hi) =>
      scoped(db().from('journal_entry_lines').select('debit,credit,account_type,posting,type'))
        .or('account_type.ilike.%bank%,account_type.ilike.%cash%')
        .range(lo, hi),
    );
    const cashBalance = round2(
      filterPosting(cashLines as RawLine[]).reduce((s, l) => s + num(l.debit) - num(l.credit), 0),
    );

    const { receivables, payables, asOf } = await cashPosition();

    return {
      status: 'ok',
      data: {
        period: periodLabel(from!, to!),
        from: from!, to: to!,
        ...pnl,
        cashBalance,
        receivables,
        payables,
        asOf,
      },
    };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not read the books.' };
  }
}

// Per-customer P&L for a period — the breakdown the dashboards show, ranked by
// revenue. Zero-activity customers are dropped. "Not specified" collects lines
// with no customer (overhead/company-wide) — the same label QuickBooks uses.
export async function getCustomerFinancials(range?: { from?: string; to?: string }): Promise<
  BooksResult<{ period: string; from: string; to: string; customers: CustomerPnL[] }>
> {
  if (!booksConfigured()) return { status: 'not_configured' };
  try {
    let from = range?.from, to = range?.to;
    if (!from || !to) {
      const r = monthRange(new Date());
      from = from ?? r.from;
      to = to ?? r.to;
    }
    let lines = filterPosting(await fetchPLLines(from, to));
    if (lines.length === 0 && !range?.from && !range?.to) {
      const lm = await latestMonth();
      if (lm) { from = lm.from; to = lm.to; lines = filterPosting(await fetchPLLines(from, to)); }
    }

    const byCustomer = new Map<string, RawLine[]>();
    for (const l of lines) {
      const key = l.customer && l.customer.trim() ? l.customer.trim() : 'Not specified';
      const arr = byCustomer.get(key) ?? [];
      arr.push(l);
      byCustomer.set(key, arr);
    }
    const customers: CustomerPnL[] = [];
    for (const [customer, rows] of byCustomer) {
      const pnl = foldPnL(rows);
      if (pnl.revenue === 0 && pnl.operatingExpenses === 0 && pnl.cogs === 0 && pnl.netIncome === 0) continue;
      customers.push({ customer, ...pnl });
    }
    customers.sort((a, b) => b.revenue - a.revenue);
    return { status: 'ok', data: { period: periodLabel(from!, to!), from: from!, to: to!, customers } };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not read the books.' };
  }
}

// Point-in-time A/R total + past due and A/P total, plus the warehouse's latest
// ledger date. Shared by getCompanyFinancials.
async function cashPosition(): Promise<{ receivables: { total: number; pastDue: number }; payables: { total: number }; asOf: string }> {
  const now = new Date();
  const [{ data: ar }, { data: ap }, { data: latest }] = await Promise.all([
    scoped(db().from('ar_aging_detail').select('open_balance,due_date')).gt('open_balance', 0),
    scoped(db().from('ap_aging').select('open_balance')).gt('open_balance', 0),
    scoped(db().from('journal_entry_lines').select('date')).order('date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  let total = 0, pastDue = 0;
  for (const r of (ar ?? []) as { open_balance: number; due_date: string | null }[]) {
    const b = num(r.open_balance);
    total += b;
    if (r.due_date && new Date(r.due_date) < now) pastDue += b;
  }
  const payTotal = ((ap ?? []) as { open_balance: number }[]).reduce((s, r) => s + num(r.open_balance), 0);
  return {
    receivables: { total: round2(total), pastDue: round2(pastDue) },
    payables: { total: round2(payTotal) },
    asOf: (latest as { date?: string } | null)?.date ?? '',
  };
}

export interface AgingRow {
  customer: string;
  current: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

// A/R aging by customer, sub-customers rolled up to their parent ("Parent:Sub" →
// "Parent"), bucketed by days past the due date — the accounts-receivable view.
export async function getArAging(): Promise<BooksResult<{ rows: AgingRow[]; totals: Omit<AgingRow, 'customer'>; asOf: string }>> {
  if (!booksConfigured()) return { status: 'not_configured' };
  try {
    const data = await fetchAll((lo, hi) =>
      scoped(db().from('ar_aging_detail').select('customer,due_date,open_balance'))
        .gt('open_balance', 0)
        .range(lo, hi),
    ) as unknown as { customer: string | null; due_date: string | null; open_balance: number }[];

    const now = Date.now();
    const map = new Map<string, AgingRow>();
    for (const r of data) {
      const parent = (r.customer ?? 'Not specified').split(':')[0].trim() || 'Not specified';
      const row = map.get(parent) ?? { customer: parent, current: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
      const bal = num(r.open_balance);
      const days = r.due_date ? Math.floor((now - new Date(r.due_date).getTime()) / 86_400_000) : 0;
      if (days <= 30) row.current += bal;
      else if (days <= 60) row.d31_60 += bal;
      else if (days <= 90) row.d61_90 += bal;
      else row.d90_plus += bal;
      row.total += bal;
      map.set(parent, row);
    }
    const rows = [...map.values()]
      .map((r) => ({
        customer: r.customer,
        current: round2(r.current), d31_60: round2(r.d31_60), d61_90: round2(r.d61_90),
        d90_plus: round2(r.d90_plus), total: round2(r.total),
      }))
      .sort((a, b) => b.total - a.total);
    const totals = rows.reduce(
      (s, r) => ({
        current: round2(s.current + r.current), d31_60: round2(s.d31_60 + r.d31_60),
        d61_90: round2(s.d61_90 + r.d61_90), d90_plus: round2(s.d90_plus + r.d90_plus), total: round2(s.total + r.total),
      }),
      { current: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 },
    );
    const { data: latest } = await scoped(db().from('ar_aging_detail').select('updated_at'))
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return { status: 'ok', data: { rows, totals, asOf: (latest as { updated_at?: string } | null)?.updated_at ?? '' } };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not read receivables.' };
  }
}

export interface CashFlow {
  from: string;
  to: string;
  dueReceivables: { customer: string; amount: number; dueDate: string | null; number: string | null }[];
  payables: { vendor: string; amount: number; dueDate: string | null; number: string | null }[];
  summary: { dueIn: number; owedOut: number; net: number };
}

// Forward cash view: open receivables (money due in, by due date) and open
// payables (money owed out) — from the aging tables, so it matches QBO. Optional
// window filters by due date.
export async function getCashFlow(range?: { from?: string; to?: string }): Promise<BooksResult<CashFlow>> {
  if (!booksConfigured()) return { status: 'not_configured' };
  try {
    const arQ = scoped(db().from('ar_aging_detail').select('customer,due_date,open_balance,number')).gt('open_balance', 0);
    const apQ = scoped(db().from('ap_aging').select('vendor,due_date,open_balance,number')).gt('open_balance', 0);
    const [{ data: ar }, { data: ap }] = await Promise.all([arQ, apQ]);

    const inWindow = (due: string | null): boolean => {
      if (!range?.from && !range?.to) return true;
      if (!due) return false;
      if (range?.from && due < range.from) return false;
      if (range?.to && due > range.to) return false;
      return true;
    };

    const dueReceivables = ((ar ?? []) as { customer: string | null; due_date: string | null; open_balance: number; number: string | null }[])
      .filter((r) => inWindow(r.due_date))
      .map((r) => ({ customer: r.customer ?? 'Not specified', amount: round2(num(r.open_balance)), dueDate: r.due_date, number: r.number ?? null }))
      .sort((a, b) => b.amount - a.amount);
    const payables = ((ap ?? []) as { vendor: string | null; due_date: string | null; open_balance: number; number: string | null }[])
      .filter((r) => inWindow(r.due_date))
      .map((r) => ({ vendor: r.vendor ?? 'Unknown', amount: round2(num(r.open_balance)), dueDate: r.due_date, number: r.number ?? null }))
      .sort((a, b) => b.amount - a.amount);

    const dueIn = round2(dueReceivables.reduce((s, r) => s + r.amount, 0));
    const owedOut = round2(payables.reduce((s, r) => s + r.amount, 0));
    return {
      status: 'ok',
      data: {
        from: range?.from ?? '', to: range?.to ?? '',
        dueReceivables, payables,
        summary: { dueIn, owedOut, net: round2(dueIn - owedOut) },
      },
    };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not read the cash calendar.' };
  }
}

// How current the books are: the latest ledger date and row count. The warehouse
// is synced from QuickBooks on the I AM CFO side; this reports freshness rather
// than triggering a sync.
export async function getBooksFreshness(): Promise<BooksResult<{ asOf: string; lineCount: number }>> {
  if (!booksConfigured()) return { status: 'not_configured' };
  try {
    const [{ data: latest }, { count }] = await Promise.all([
      scoped(db().from('journal_entry_lines').select('date')).order('date', { ascending: false }).limit(1).maybeSingle(),
      scoped(db().from('journal_entry_lines').select('*', { count: 'exact', head: true })),
    ]);
    return { status: 'ok', data: { asOf: (latest as { date?: string } | null)?.date ?? '', lineCount: count ?? 0 } };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not read the books.' };
  }
}
