import { createServerSupabase } from '@/lib/supabase/server';
import type { EarningRow, CadenceRow, SnapshotRow } from '@/lib/crm/analytics';
import type {
  AgencySettings,
  AssistantDraft,
  AssistantMemory,
  Company,
  CompanyOverview,
  CompanyStatus,
  CompanyTalent,
  CompanyType,
  Contact,
  DealWithBudget,
  DraftKind,
  Lead,
  MemoryCategory,
  Profile,
  Talent,
} from './types';

// All reads use the request-scoped server client, so RLS runs as the logged-in
// user — budget comes back NULL for members straight from Postgres.

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

// ---- Companies ----------------------------------------------------------

export type CompanySort =
  | 'name'
  | 'type'
  | 'category'
  | 'status'
  | 'deal_count'
  | 'contact_count'
  | 'date_last_booked';

export interface ListCompaniesParams {
  search?: string;
  type?: CompanyType | '';
  status?: CompanyStatus | '';
  sortBy?: CompanySort;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ListCompaniesResult {
  companies: CompanyOverview[];
  total: number;
}

const COMPANY_SORT_COLUMNS: Record<CompanySort, string> = {
  name: 'name',
  type: 'type',
  category: 'category',
  status: 'status',
  deal_count: 'deal_count',
  contact_count: 'contact_count',
  date_last_booked: 'date_last_booked',
};

// AA Top Talent–style server-side list: text search + type/status filters +
// column sort + pagination, with an exact total for the pager. Reads the
// company_overview view so deal/contact tallies come back precomputed.
export async function listCompanies(params: ListCompaniesParams = {}): Promise<ListCompaniesResult> {
  const supabase = await createServerSupabase();
  const {
    search = '',
    type = '',
    status = '',
    sortBy = 'name',
    sortOrder = 'asc',
    limit = 12,
    offset = 0,
  } = params;

  let query = supabase.from('company_overview').select('*', { count: 'exact' });

  // Strip characters that would break PostgREST's or()/ilike grammar.
  const safe = search.trim().replace(/[,()%*]/g, ' ').trim();
  if (safe) {
    query = query.or(`name.ilike.%${safe}%,category.ilike.%${safe}%,website.ilike.%${safe}%`);
  }
  if (type) query = query.eq('type', type);
  if (status) query = query.eq('status', status);

  const col = COMPANY_SORT_COLUMNS[sortBy] ?? 'name';
  query = query.order(col, { ascending: sortOrder === 'asc', nullsFirst: false });
  if (col !== 'name') query = query.order('name', { ascending: true });
  query = query.range(offset, offset + limit - 1);

  const { data, count } = await query;
  return { companies: (data as CompanyOverview[]) ?? [], total: count ?? 0 };
}

export async function getCompany(id: string): Promise<CompanyOverview | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('company_overview').select('*').eq('id', id).maybeSingle();
  return (data as CompanyOverview) ?? null;
}

// The full editable row (includes notes/employee_count) for the edit form.
export async function getCompanyRecord(id: string): Promise<Company | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('companies')
    .select('id, name, type, category, employee_count, website, notes, status, logo_url, is_public')
    .eq('id', id)
    .maybeSingle();
  return (data as Company) ?? null;
}

export async function getCompanyTalent(companyId: string): Promise<CompanyTalent[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('company_talent').select('*').eq('company_id', companyId);
  return (data as CompanyTalent[]) ?? [];
}

// ---- Contacts -----------------------------------------------------------

export async function getCompanyContacts(companyId: string): Promise<Contact[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('contacts')
    .select('id, company_id, name, email, phone, title, is_primary')
    .eq('company_id', companyId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true });
  return (data as Contact[]) ?? [];
}

export async function getContact(id: string): Promise<Contact | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('contacts')
    .select('id, company_id, name, email, phone, title, is_primary')
    .eq('id', id)
    .maybeSingle();
  return (data as Contact) ?? null;
}

export async function listTalent(): Promise<Talent[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('talent')
    .select('id, name, handle, category, notes, headshot_url')
    .order('name');
  return (data as Talent[]) ?? [];
}

// ---- Talent browsing (AA-style search / filter / sort) ------------------

export type TalentSort = 'name' | 'handle' | 'category';

export interface ListTalentParams {
  search?: string;
  category?: string;
  sortBy?: TalentSort;
  sortOrder?: 'asc' | 'desc';
}

const TALENT_SORT_COLUMNS: Record<TalentSort, string> = {
  name: 'name',
  handle: 'handle',
  category: 'category',
};

export async function listTalentBrowse(params: ListTalentParams = {}): Promise<Talent[]> {
  const supabase = await createServerSupabase();
  const { search = '', category = '', sortBy = 'name', sortOrder = 'asc' } = params;

  let query = supabase.from('talent').select('id, name, handle, category, notes, headshot_url');

  const safe = search.trim().replace(/[,()%*]/g, ' ').trim();
  if (safe) query = query.or(`name.ilike.%${safe}%,handle.ilike.%${safe}%,category.ilike.%${safe}%`);
  if (category) query = query.eq('category', category);

  const col = TALENT_SORT_COLUMNS[sortBy] ?? 'name';
  query = query.order(col, { ascending: sortOrder === 'asc', nullsFirst: false });
  if (col !== 'name') query = query.order('name', { ascending: true });

  const { data } = await query;
  return (data as Talent[]) ?? [];
}

// Distinct, non-empty talent categories for the filter dropdown.
export async function talentCategories(): Promise<string[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('talent').select('category').not('category', 'is', null);
  const set = new Set(
    ((data as { category: string | null }[] | null) ?? [])
      .map((r) => r.category?.trim())
      .filter((c): c is string => Boolean(c)),
  );
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function getTalent(id: string): Promise<Talent | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('talent')
    .select(
      'id, name, handle, category, notes, headshot_url, asana_project_gid, user_id, slug, bio, is_public, is_featured, audience_stats, payout_pct',
    )
    .eq('id', id)
    .maybeSingle();
  return (data as Talent) ?? null;
}

export interface DealListRow extends DealWithBudget {
  company_name: string;
  talent_name: string;
}

export type DateRange = { from: string | null; to: string | null };

export async function listDeals(range?: DateRange): Promise<DealListRow[]> {
  const supabase = await createServerSupabase();
  let query = supabase.from('deals_with_budget').select('*');
  // A date filter excludes deals with no booking_date (they can't be placed in a
  // period); "all time" (no range) still returns them.
  if (range?.from) query = query.gte('booking_date', range.from);
  if (range?.to) query = query.lte('booking_date', range.to);
  const { data } = await query.order('booking_date', { ascending: false, nullsFirst: false });
  const rows = (data as DealWithBudget[]) ?? [];
  return hydrate(rows);
}

export async function getDeal(id: string): Promise<DealWithBudget | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('deals_with_budget').select('*').eq('id', id).maybeSingle();
  return (data as DealWithBudget) ?? null;
}

async function hydrate(rows: DealWithBudget[]): Promise<DealListRow[]> {
  if (rows.length === 0) return [];
  const supabase = await createServerSupabase();
  const companyIds = [...new Set(rows.map((r) => r.company_id))];
  const talentIds = [...new Set(rows.map((r) => r.talent_id))];
  const [{ data: companies }, { data: talent }] = await Promise.all([
    supabase.from('companies').select('id, name').in('id', companyIds),
    supabase.from('talent').select('id, name').in('id', talentIds),
  ]);
  const cMap = new Map((companies as Pick<Company, 'id' | 'name'>[] | null)?.map((c) => [c.id, c.name]) ?? []);
  const tMap = new Map((talent as Pick<Talent, 'id' | 'name'>[] | null)?.map((t) => [t.id, t.name]) ?? []);
  return rows.map((r) => ({
    ...r,
    company_name: cMap.get(r.company_id) ?? 'Unknown',
    talent_name: tMap.get(r.talent_id) ?? 'Unknown',
  }));
}

export async function companyOptions(): Promise<Pick<Company, 'id' | 'name'>[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('companies').select('id, name').order('name');
  return data ?? [];
}

export async function getAgencySettings(): Promise<AgencySettings> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('agency_settings')
    .select('monthly_target, annual_goal, default_agency_pct')
    .eq('id', 1)
    .maybeSingle();
  return (
    (data as AgencySettings) ?? { monthly_target: null, annual_goal: null, default_agency_pct: 20 }
  );
}

export async function talentOptions(): Promise<Pick<Talent, 'id' | 'name'>[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('talent').select('id, name').order('name');
  return data ?? [];
}

export async function listLeads(): Promise<Lead[]> {
  const supabase = await createServerSupabase();
  // Surface who's due first: soonest next-eligible date on top, undated (e.g.
  // website leads) fall to the bottom by recency.
  const { data } = await supabase
    .from('leads')
    .select('*')
    .order('next_eligible_on', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  return (data as Lead[]) ?? [];
}

// Collections snapshot from deal financials (owner-only via RLS): Paid = gross
// of completed deals; Owed = gross of invoiced deals not yet completed.
export interface Collections {
  owed: number;
  paid: number;
  invoiced: number;
}

export async function getCollections(): Promise<Collections> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('deal_financials')
    .select('gross, deals(status, invoice_number)');
  const rows =
    (data as { gross: number | null; deals: { status: string; invoice_number: string | null } | null }[] | null) ??
    [];
  let owed = 0;
  let paid = 0;
  for (const r of rows) {
    const gross = Number(r.gross) || 0;
    if (!gross) continue;
    if (r.deals?.status === 'completed') paid += gross;
    else if (r.deals?.invoice_number) owed += gross;
  }
  return { owed, paid, invoiced: owed + paid };
}

// The talent row linked to the logged-in user (for the talent portal).
export interface MyTalent {
  id: string;
  name: string;
  slug: string | null;
  headshot_url: string | null;
  category: string | null;
  location: string | null;
  bio: string | null;
  is_public: boolean;
}
export async function getMyTalent(): Promise<MyTalent | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('talent')
    .select('id, name, slug, headshot_url, category, location, bio, is_public')
    .eq('user_id', user.id)
    .maybeSingle();
  return (data as MyTalent) ?? null;
}

export interface TalentAccount {
  id: string;
  talent_id: string;
  platform: string;
  handle: string | null;
  url: string | null;
  followers: number | null;
  sort: number;
  verified: boolean;
  last_synced_at: string | null;
  yt_channel_id: string | null;
}

// A creator's self-managed social accounts (portal + media kit). Fails soft to
// an empty list if the table isn't there yet.
export async function getTalentAccounts(talentId: string): Promise<TalentAccount[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('talent_accounts')
    .select('id, talent_id, platform, handle, url, followers, sort, verified, last_synced_at, yt_channel_id')
    .eq('talent_id', talentId)
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data as TalentAccount[]) ?? [];
}

export async function getInstagramConnection(
  talentId: string,
): Promise<{ username: string | null; token_expiry: string | null } | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('instagram_connections')
    .select('username, token_expiry')
    .eq('talent_id', talentId)
    .maybeSingle();
  if (error) return null;
  return (data as { username: string | null; token_expiry: string | null }) ?? null;
}

// Days until a stored token lapses (negative = already expired), or null if
// there's no connection/expiry. Drives the "reconnect" nudge in the portal.
export function igExpiryDays(conn: { token_expiry: string | null } | null): number | null {
  if (!conn?.token_expiry) return null;
  return Math.floor((new Date(conn.token_expiry).getTime() - Date.now()) / (24 * 3600 * 1000));
}

export async function getTikTokConnection(
  talentId: string,
): Promise<{ username: string | null; token_expiry: string | null } | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('tiktok_connections')
    .select('username, refresh_expiry')
    .eq('talent_id', talentId)
    .maybeSingle();
  if (error) return null;
  const row = data as { username: string | null; refresh_expiry: string | null } | null;
  if (!row) return null;
  // The reconnect nudge should track the long-lived refresh token (~365 days) —
  // the 24h access token auto-refreshes, so it must not drive the banner.
  return { username: row.username, token_expiry: row.refresh_expiry };
}

export interface ContentMedia {
  id: string;
  url: string;
  kind: string;
}
export async function getContentMedia(talentId: string): Promise<ContentMedia[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('content_media')
    .select('id, url, kind')
    .eq('talent_id', talentId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data as ContentMedia[]) ?? [];
}

export interface ContentPost {
  id: string;
  deal_id: string | null;
  platform: string;
  caption: string | null;
  scheduled_for: string | null;
  scheduled_at: string | null;
  status: string;
  media_urls: string[];
  published_at: string | null;
  publish_error: string | null;
}
export async function getContentPosts(talentId: string): Promise<ContentPost[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('content_posts')
    .select(
      'id, deal_id, platform, caption, scheduled_for, scheduled_at, status, media_urls, published_at, publish_error',
    )
    .eq('talent_id', talentId)
    .order('scheduled_for', { ascending: true, nullsFirst: false });
  if (error) return [];
  return (data as ContentPost[]) ?? [];
}

// Every creator's posts, for the staff schedule view at /crm/content. RLS
// (content_posts_staff) returns all rows for staff; the talent name rides along
// via the talent_id FK.
export interface AdminContentPost {
  id: string;
  talent_id: string;
  talent_name: string;
  deal_id: string | null;
  platform: string;
  caption: string | null;
  scheduled_for: string | null;
  scheduled_at: string | null;
  status: string;
  media_urls: string[];
  published_at: string | null;
  publish_error: string | null;
}
export async function getAllContentPosts(): Promise<AdminContentPost[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('content_posts')
    .select(
      'id, talent_id, deal_id, platform, caption, scheduled_for, scheduled_at, status, media_urls, published_at, publish_error, talent:talent_id(name)',
    )
    .order('scheduled_at', { ascending: true, nullsFirst: false });
  if (error) return [];
  type Row = Omit<AdminContentPost, 'talent_name' | 'media_urls'> & {
    media_urls: string[] | null;
    // Supabase types an embedded to-one relation as an array; it's an object at runtime.
    talent: { name: string } | { name: string }[] | null;
  };
  return ((data as unknown as Row[]) ?? []).map(({ talent, media_urls, ...rest }) => {
    const t = Array.isArray(talent) ? talent[0] : talent;
    return {
      ...rest,
      media_urls: media_urls ?? [],
      talent_name: t?.name ?? 'Unknown creator',
    };
  });
}

export interface PortalDeal {
  id: string;
  company_name: string;
  booking_date: string | null;
  status: string;
  invoice_number: string | null;
  gross: number | null;
}

// The logged-in talent's own deals (RLS scopes rows to them).
export async function listMyDeals(): Promise<PortalDeal[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('deals')
    .select('id, booking_date, status, invoice_number, companies(name), deal_financials(gross)')
    .order('booking_date', { ascending: false, nullsFirst: false });
  const rows =
    (data as {
      id: string;
      booking_date: string | null;
      status: string;
      invoice_number: string | null;
      companies: { name: string } | { name: string }[] | null;
      deal_financials: { gross: number | null } | { gross: number | null }[] | null;
    }[] | null) ?? [];
  return rows.map((r) => ({
    id: r.id,
    company_name: one(r.companies)?.name ?? 'Company',
    booking_date: r.booking_date,
    status: r.status,
    invoice_number: r.invoice_number,
    gross: one(r.deal_financials)?.gross ?? null,
  }));
}

// Per-talent performance rollup. Money (billed/owed/total) comes from
// deal_financials, which is owner-only under RLS — members see deal counts with
// zeroed amounts. Ranked by amount billed.
export interface TalentPerf {
  id: string;
  name: string;
  deals: number;
  completed: number;
  billed: number;
  owed: number;
  total: number;
}

type DealPerfRow = {
  talent_id: string | null;
  status: string;
  invoice_number: string | null;
  talent: { name: string } | { name: string }[] | null;
  deal_financials: { gross: number | null } | { gross: number | null }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function talentPerformance(): Promise<TalentPerf[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('deals')
    .select('talent_id, status, invoice_number, talent(name), deal_financials(gross)');
  const rows = (data as DealPerfRow[] | null) ?? [];
  const map = new Map<string, TalentPerf>();
  for (const r of rows) {
    if (!r.talent_id) continue;
    let p = map.get(r.talent_id);
    if (!p) {
      p = {
        id: r.talent_id,
        name: one(r.talent)?.name ?? 'Unknown',
        deals: 0,
        completed: 0,
        billed: 0,
        owed: 0,
        total: 0,
      };
      map.set(r.talent_id, p);
    }
    p.deals += 1;
    const gross = Number(one(r.deal_financials)?.gross) || 0;
    p.total += gross;
    if (r.status === 'completed') {
      p.completed += 1;
      p.billed += gross;
    } else if (r.invoice_number) {
      p.owed += gross;
    }
  }
  return [...map.values()].sort((a, b) => b.billed - a.billed || b.total - a.total);
}

// Per-company performance rollup (owner-only amounts), ranked by amount billed.
export interface CompanyPerf {
  id: string;
  name: string;
  deals: number;
  billed: number;
  owed: number;
  total: number;
}

export async function companyPerformance(): Promise<CompanyPerf[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('deals')
    .select('company_id, status, invoice_number, companies(name), deal_financials(gross)');
  const rows =
    (data as {
      company_id: string | null;
      status: string;
      invoice_number: string | null;
      companies: { name: string } | { name: string }[] | null;
      deal_financials: { gross: number | null } | { gross: number | null }[] | null;
    }[] | null) ?? [];
  const map = new Map<string, CompanyPerf>();
  for (const r of rows) {
    if (!r.company_id) continue;
    let p = map.get(r.company_id);
    if (!p) {
      p = { id: r.company_id, name: one(r.companies)?.name ?? 'Company', deals: 0, billed: 0, owed: 0, total: 0 };
      map.set(r.company_id, p);
    }
    p.deals += 1;
    const gross = Number(one(r.deal_financials)?.gross) || 0;
    p.total += gross;
    if (r.status === 'completed') p.billed += gross;
    else if (r.invoice_number) p.owed += gross;
  }
  return [...map.values()].sort((a, b) => b.billed - a.billed || b.total - a.total);
}

// Billing summary for one talent (owner-only amounts), for their profile page.
export async function getTalentBilling(
  talentId: string,
): Promise<{ deals: number; billed: number; owed: number; total: number }> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('deals')
    .select('status, invoice_number, deal_financials(gross)')
    .eq('talent_id', talentId);
  const rows =
    (data as { status: string; invoice_number: string | null; deal_financials: { gross: number | null } | { gross: number | null }[] | null }[] | null) ??
    [];
  let billed = 0;
  let owed = 0;
  let total = 0;
  for (const r of rows) {
    const gross = Number(one(r.deal_financials)?.gross) || 0;
    total += gross;
    if (r.status === 'completed') billed += gross;
    else if (r.invoice_number) owed += gross;
  }
  return { deals: rows.length, billed, owed, total };
}

// ---- Analytics rows (per talent) --------------------------------------------
// Each returns raw rows for lib/crm/analytics.ts to aggregate. Scoped by
// talent_id so a staff member can pull any creator's series and a creator (via
// RLS) can only ever pull their own.

export async function getTalentEarningRows(talentId: string): Promise<EarningRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('deals')
    .select('booking_date, status, invoice_number, deal_financials(gross)')
    .eq('talent_id', talentId);
  const rows =
    (data as {
      booking_date: string | null;
      status: string;
      invoice_number: string | null;
      deal_financials: { gross: number | null } | { gross: number | null }[] | null;
    }[] | null) ?? [];
  return rows.map((r) => ({
    booking_date: r.booking_date,
    status: r.status,
    invoice_number: r.invoice_number,
    gross: one(r.deal_financials)?.gross ?? null,
  }));
}

export async function getTalentCadenceRows(talentId: string): Promise<CadenceRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('content_posts')
    .select('scheduled_at, scheduled_for, published_at, status')
    .eq('talent_id', talentId);
  return (data as CadenceRow[] | null) ?? [];
}

export async function getFollowerSnapshots(
  talentId: string,
  days = 90,
): Promise<SnapshotRow[]> {
  const supabase = await createServerSupabase();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('follower_snapshots')
    .select('captured_on, followers')
    .eq('talent_id', talentId)
    .gte('captured_on', since)
    .order('captured_on', { ascending: true });
  return (data as SnapshotRow[] | null) ?? [];
}

// ---- Agency-wide analytics rows (staff only) --------------------------------
// No talent filter — RLS lets staff read every row, so these roll up the whole
// roster. A non-staff caller gets only their own rows back (harmless).

export async function getAllEarningRows(): Promise<EarningRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('deals')
    .select('booking_date, status, invoice_number, deal_financials(gross)');
  const rows =
    (data as {
      booking_date: string | null;
      status: string;
      invoice_number: string | null;
      deal_financials: { gross: number | null } | { gross: number | null }[] | null;
    }[] | null) ?? [];
  return rows.map((r) => ({
    booking_date: r.booking_date,
    status: r.status,
    invoice_number: r.invoice_number,
    gross: one(r.deal_financials)?.gross ?? null,
  }));
}

export async function getAllCadenceRows(): Promise<CadenceRow[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('content_posts')
    .select('scheduled_at, scheduled_for, published_at, status');
  return (data as CadenceRow[] | null) ?? [];
}

export async function getAllFollowerSnapshots(days = 90): Promise<SnapshotRow[]> {
  const supabase = await createServerSupabase();
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('follower_snapshots')
    .select('captured_on, followers')
    .gte('captured_on', since)
    .order('captured_on', { ascending: true });
  return (data as SnapshotRow[] | null) ?? [];
}

// A connected Instagram professional account whose token can run Business
// Discovery lookups. Prefers a dedicated env token, else any stored connection
// (staff can read all under RLS). Never exposes the token to the browser.
export async function getInstagramDiscovery(): Promise<{ igUserId: string; token: string } | null> {
  if (process.env.IG_DISCOVERY_IG_ID && process.env.IG_DISCOVERY_TOKEN) {
    return { igUserId: process.env.IG_DISCOVERY_IG_ID, token: process.env.IG_DISCOVERY_TOKEN };
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('instagram_connections')
    .select('ig_user_id, access_token')
    .not('access_token', 'is', null)
    .limit(1)
    .maybeSingle();
  const row = data as { ig_user_id: string; access_token: string } | null;
  return row ? { igUserId: row.ig_user_id, token: row.access_token } : null;
}

// The talent's own Facebook-login IG connection (Page-linked) — token used for
// insights + self lookups. Server-side only.
export async function getInstagramGraphConnection(
  talentId: string,
): Promise<{ ig_business_id: string; page_token: string; ig_username: string | null } | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('instagram_graph_connections')
    .select('ig_business_id, page_token, ig_username')
    .eq('talent_id', talentId)
    .maybeSingle();
  return (data as { ig_business_id: string; page_token: string; ig_username: string | null }) ?? null;
}

// A Facebook-login IG connection whose token can run Business Discovery for any
// public handle (for creators who haven't connected). Env override, else any row.
export async function getInstagramGraphDiscovery(): Promise<{ igBusinessId: string; token: string } | null> {
  if (process.env.FB_DISCOVERY_IG_ID && process.env.FB_DISCOVERY_TOKEN) {
    return { igBusinessId: process.env.FB_DISCOVERY_IG_ID, token: process.env.FB_DISCOVERY_TOKEN };
  }
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('instagram_graph_connections')
    .select('ig_business_id, page_token')
    .not('page_token', 'is', null)
    .limit(1)
    .maybeSingle();
  const row = data as { ig_business_id: string; page_token: string } | null;
  return row ? { igBusinessId: row.ig_business_id, token: row.page_token } : null;
}

export interface InstagramStats {
  talent_id: string;
  username: string | null;
  followers: number | null;
  media_count: number | null;
  engagement_rate: number | null;
  avg_post_likes: number | null;
  avg_post_comments: number | null;
  recent_posts:
    | { permalink: string; mediaUrl: string | null; mediaType: string | null; likeCount: number; commentsCount: number; timestamp: string | null }[]
    | null;
  reach: number | null;
  views: number | null;
  saves: number | null;
  total_interactions: number | null;
  avg_story_views: number | null;
  audience_gender: Record<string, number> | null;
  audience_age: Record<string, number> | null;
  audience_country: Record<string, number> | null;
  has_insights: boolean;
  synced_at: string | null;
}

export async function getInstagramStats(talentId: string): Promise<InstagramStats | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('instagram_stats')
    .select('*')
    .eq('talent_id', talentId)
    .maybeSingle();
  return (data as InstagramStats) ?? null;
}

export async function getLead(id: string): Promise<Lead | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
  return (data as Lead) ?? null;
}

// ---- Assistant drafts (Zordon, Tier 3) ---------------------------------------
// Draft-only outreach. Owner/admin under RLS. Nothing sends from here.

export async function listAssistantDrafts(): Promise<AssistantDraft[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assistant_drafts')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as AssistantDraft[]) ?? [];
}

export interface NewAssistantDraft {
  kind: DraftKind;
  to_name?: string | null;
  to_email?: string | null;
  subject: string;
  body: string;
  lead_id?: string | null;
  talent_id?: string | null;
  company_id?: string | null;
}

export async function createAssistantDraft(
  draft: NewAssistantDraft,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('assistant_drafts')
    .insert({
      kind: draft.kind,
      to_name: draft.to_name ?? null,
      to_email: draft.to_email ?? null,
      subject: draft.subject,
      body: draft.body,
      lead_id: draft.lead_id ?? null,
      talent_id: draft.talent_id ?? null,
      company_id: draft.company_id ?? null,
    })
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

// ---- Assistant memory (Zordon, Tier 4) ---------------------------------------
// Durable facts loaded into Zordon's prompt; added via her `remember` tool.

export async function listAssistantMemories(): Promise<AssistantMemory[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('assistant_memory')
    .select('*')
    .order('created_at', { ascending: false });
  return (data as AssistantMemory[]) ?? [];
}

export interface NewAssistantMemory {
  content: string;
  category?: MemoryCategory;
  subject?: string | null;
  talent_id?: string | null;
  company_id?: string | null;
}

export async function createAssistantMemory(
  memory: NewAssistantMemory,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('assistant_memory')
    .insert({
      content: memory.content,
      category: memory.category ?? 'general',
      subject: memory.subject ?? null,
      talent_id: memory.talent_id ?? null,
      company_id: memory.company_id ?? null,
    })
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

// Tulips' own booked-revenue roll-up, aggregated from deal budgets. Budgets come
// back NULL for non-owners (RLS), so this only sums to a real total for
// owner/admin sessions — matching how budget is gated everywhere else.
export interface BookedRevenue {
  total: number;
  dealCount: number;
  withBudget: number;
  byStatus: { status: DealWithBudget['status']; count: number; amount: number }[];
}

export interface CrmCounts {
  companies: number;
  contacts: number;
  talent: number;
  deals: number;
  leads: number;
}

export async function getCrmCounts(): Promise<CrmCounts> {
  const supabase = await createServerSupabase();
  const tables = ['companies', 'contacts', 'talent', 'deals', 'leads'] as const;
  const results = await Promise.all(
    tables.map((t) => supabase.from(t).select('*', { count: 'exact', head: true })),
  );
  const counts = {} as CrmCounts;
  tables.forEach((t, i) => {
    counts[t] = results[i].count ?? 0;
  });
  return counts;
}

export async function bookedRevenueRollup(range?: DateRange): Promise<BookedRevenue> {
  const deals = await listDeals(range);
  const order: DealWithBudget['status'][] = ['pitched', 'confirmed', 'live', 'completed'];
  const buckets = new Map(order.map((s) => [s, { status: s, count: 0, amount: 0 }]));

  let total = 0;
  let withBudget = 0;
  for (const d of deals) {
    const bucket = buckets.get(d.status);
    if (bucket) bucket.count += 1;
    if (d.budget != null) {
      total += d.budget;
      withBudget += 1;
      if (bucket) bucket.amount += d.budget;
    }
  }

  return {
    total,
    dealCount: deals.length,
    withBudget,
    byStatus: order.map((s) => buckets.get(s)!),
  };
}
