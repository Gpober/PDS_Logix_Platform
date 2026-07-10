import { createServerSupabase } from '@/lib/supabase/server';
import { getAgencySettings } from '@/lib/crm/data';

// Owner-only sales analytics, modelled on the client's invoice/dashboard sheet:
// deals secured ($ + count), agency payout, inbound vs outbound, monthly
// progress vs goal, top producers, A/R by company, A/P by talent, source
// breakdown, and a talent x month matrix. Deal value comes from deal_budgets
// (owner-visible via RLS through the deals_with_budget view); the caller must
// be owner/admin or every amount is null → zero.

export interface NamedAmount {
  id: string;
  name: string;
  amount: number;
  count: number;
}

export interface MonthPoint {
  month: string; // YYYY-MM
  label: string; // e.g. "Jan"
  amount: number;
  count: number;
}

export interface MatrixRow {
  id: string;
  name: string;
  months: number[]; // 12 amounts
  total: number;
  countMonths: number[]; // 12 counts
  totalCount: number;
}

export interface SalesAnalytics {
  year: number;
  isCurrentYear: boolean;
  availableYears: number[];
  monthlyTarget: number | null;
  annualGoal: number | null;
  // Year-to-date
  ytdAmount: number;
  ytdCount: number;
  ytdAgencyPayout: number;
  pctOfGoal: number | null;
  // Current month
  monthAmount: number;
  monthCount: number;
  monthAgencyPayout: number;
  vsTarget: number | null; // monthAmount - monthlyTarget
  // Splits & lists
  inbound: { amount: number; count: number };
  outbound: { amount: number; count: number };
  unclassified: { amount: number; count: number };
  monthly: MonthPoint[]; // 12 points for the year
  topProducers: NamedAmount[]; // talent by secured $ (YTD)
  arByCompany: NamedAmount[]; // uncollected owed to us, by company
  apByTalent: NamedAmount[]; // balances owed to talent
  bySource: NamedAmount[]; // secured $ by lead source (YTD)
  matrix: {
    rows: MatrixRow[];
    monthTotals: number[];
    grandTotal: number;
  };
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DealRow {
  id: string;
  company_id: string;
  talent_id: string;
  booking_date: string | null;
  status: string;
  invoice_number: string | null;
  channel: 'inbound' | 'outbound' | null;
  source: string | null;
  budget: number | null;
}

export async function getSalesAnalytics(selectedYear?: number): Promise<SalesAnalytics> {
  const supabase = await createServerSupabase();
  const settings = await getAgencySettings();
  const defaultAgencyPct = Number(settings.default_agency_pct) || 20;

  const [{ data: dealData }, { data: talentData }, { data: companyData }, { data: finData }] =
    await Promise.all([
      supabase
        .from('deals_with_budget')
        .select('id, company_id, talent_id, booking_date, status, invoice_number, channel, source, budget'),
      supabase.from('talent').select('id, name, payout_pct'),
      supabase.from('companies').select('id, name'),
      supabase.from('deal_financials').select('deal_id, gross'),
    ]);

  const deals = (dealData as DealRow[] | null) ?? [];
  const talent = (talentData as { id: string; name: string; payout_pct: number | null }[] | null) ?? [];
  const companies = (companyData as { id: string; name: string }[] | null) ?? [];
  const talentName = new Map(talent.map((t) => [t.id, t.name]));
  const talentPayout = new Map(talent.map((t) => [t.id, t.payout_pct]));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  // Deal value falls back to deal_financials.gross when no budget is set.
  const grossMap = new Map(
    ((finData as { deal_id: string; gross: number | null }[] | null) ?? []).map((f) => [f.deal_id, f.gross]),
  );

  const now = new Date();
  const currentYear = now.getFullYear();
  // Years present in the data (desc), so the picker only offers real options.
  const availableYears = [
    ...new Set(
      deals
        .map((d) => (d.booking_date ? Number(d.booking_date.slice(0, 4)) : null))
        .filter((y): y is number => y != null),
    ),
  ].sort((a, b) => b - a);
  const year = selectedYear ?? availableYears[0] ?? currentYear;
  const isCurrentYear = year === currentYear;
  const month = now.getMonth();

  // Per-deal derived values.
  const agencyPctFor = (talentId: string) => {
    const p = talentPayout.get(talentId);
    // payout_pct is the talent's cut; the agency keeps the rest.
    return p != null && Number.isFinite(Number(p)) ? 100 - Number(p) : defaultAgencyPct;
  };

  let ytdAmount = 0;
  let ytdCount = 0;
  let ytdAgencyPayout = 0;
  let monthAmount = 0;
  let monthCount = 0;
  let monthAgencyPayout = 0;

  const inbound = { amount: 0, count: 0 };
  const outbound = { amount: 0, count: 0 };
  const unclassified = { amount: 0, count: 0 };

  const monthly: MonthPoint[] = MONTH_LABELS.map((label, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    label,
    amount: 0,
    count: 0,
  }));

  const producers = new Map<string, NamedAmount>();
  const arCompany = new Map<string, NamedAmount>();
  const apTalent = new Map<string, NamedAmount>();
  const sources = new Map<string, NamedAmount>();

  // Matrix: talent x 12 months (YTD).
  const matrixRows = new Map<string, MatrixRow>();
  const monthTotals = new Array(12).fill(0);
  let grandTotal = 0;

  const add = (m: Map<string, NamedAmount>, id: string, name: string, amount: number) => {
    const cur = m.get(id) ?? { id, name, amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += 1;
    m.set(id, cur);
  };

  for (const d of deals) {
    const amount = Number(d.budget) || Number(grossMap.get(d.id)) || 0;
    const agencyAmount = (amount * agencyPctFor(d.talent_id)) / 100;
    const talentAmount = amount - agencyAmount;

    // A/R and A/P are current balances (any period): invoiced but not completed.
    const owed = Boolean(d.invoice_number) && d.status !== 'completed';
    if (owed) {
      add(arCompany, d.company_id, companyName.get(d.company_id) ?? 'Unknown', amount);
      add(apTalent, d.talent_id, talentName.get(d.talent_id) ?? 'Unknown', talentAmount);
    }

    if (!d.booking_date) continue;
    const y = Number(d.booking_date.slice(0, 4));
    const m = Number(d.booking_date.slice(5, 7)) - 1;
    if (y !== year || m < 0 || m > 11) continue;

    // Year-to-date rollups.
    ytdAmount += amount;
    ytdCount += 1;
    ytdAgencyPayout += agencyAmount;
    monthly[m].amount += amount;
    monthly[m].count += 1;

    if (isCurrentYear && m === month) {
      monthAmount += amount;
      monthCount += 1;
      monthAgencyPayout += agencyAmount;
    }

    const bucket = d.channel === 'inbound' ? inbound : d.channel === 'outbound' ? outbound : unclassified;
    bucket.amount += amount;
    bucket.count += 1;

    add(producers, d.talent_id, talentName.get(d.talent_id) ?? 'Unknown', amount);
    add(sources, d.source?.trim() || 'unspecified', d.source?.trim() || 'Unspecified', amount);

    // Matrix.
    const row =
      matrixRows.get(d.talent_id) ??
      ({
        id: d.talent_id,
        name: talentName.get(d.talent_id) ?? 'Unknown',
        months: new Array(12).fill(0),
        total: 0,
        countMonths: new Array(12).fill(0),
        totalCount: 0,
      } satisfies MatrixRow);
    row.months[m] += amount;
    row.total += amount;
    row.countMonths[m] += 1;
    row.totalCount += 1;
    matrixRows.set(d.talent_id, row);
    monthTotals[m] += amount;
    grandTotal += amount;
  }

  const topN = (m: Map<string, NamedAmount>, n: number) =>
    [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, n);

  return {
    year,
    isCurrentYear,
    availableYears,
    monthlyTarget: settings.monthly_target != null ? Number(settings.monthly_target) : null,
    annualGoal: settings.annual_goal != null ? Number(settings.annual_goal) : null,
    ytdAmount,
    ytdCount,
    ytdAgencyPayout,
    pctOfGoal:
      settings.annual_goal && Number(settings.annual_goal) > 0
        ? (ytdAmount / Number(settings.annual_goal)) * 100
        : null,
    monthAmount,
    monthCount,
    monthAgencyPayout,
    vsTarget: settings.monthly_target != null ? monthAmount - Number(settings.monthly_target) : null,
    inbound,
    outbound,
    unclassified,
    monthly,
    topProducers: topN(producers, 8),
    arByCompany: topN(arCompany, 8),
    apByTalent: topN(apTalent, 8),
    bySource: [...sources.values()].sort((a, b) => b.amount - a.amount),
    matrix: {
      rows: [...matrixRows.values()].sort((a, b) => b.total - a.total),
      monthTotals,
      grandTotal,
    },
  };
}
