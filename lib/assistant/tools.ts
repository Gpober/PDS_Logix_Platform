import type Anthropic from '@anthropic-ai/sdk';
import {
  companyOptions,
  companyPerformance,
  createAssistantDraft,
  createAssistantMemory,
  getAllContentPosts,
  getAgencySettings,
  getCompany,
  getCompanyContacts,
  getCompanyRecord,
  getCompanyTalent,
  getContentPosts,
  getCrmCounts,
  getFollowerSnapshots,
  getInstagramGraphConnection,
  getInstagramStats,
  getTalentBilling,
  listCompanies,
  listDeals,
  listLeads,
  listTalent,
  talentPerformance,
  type CompanySort,
} from '@/lib/crm/data';
import { getSalesAnalytics } from '@/lib/crm/salesAnalytics';
import { getCashCalendar } from '@/lib/crm/cashCalendar';
import { runSpecialist, SPECIALIST_KEYS } from '@/lib/assistant/specialists';
import type {
  CompanyStatus,
  CompanyType,
  DealStatus,
  DraftKind,
  Lead,
  MemoryCategory,
  Talent,
} from '@/lib/crm/types';

// Zordon's hands — a read-only tool registry over every CRM table and report.
// Each tool resolves human names/handles to ids server-side (the model never
// sees a UUID it has to remember), runs under the caller's RLS, and returns a
// compact JSON payload. Nothing here writes; consequential actions come later.

type Json = Record<string, unknown>;

// ---- name resolution --------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase().replace(/^@/, '');

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

async function resolveTalent(query: string): Promise<{ talent?: Talent; error?: Json }> {
  const all = await listTalent();
  const byHandle = pickBest(query, all, (t) => t.handle ?? '');
  const chosen = byHandle.hit ?? pickBest(query, all, (t) => t.name).hit;
  if (chosen) return { talent: chosen };
  const cands = pickBest(query, all, (t) => t.name).candidates;
  return {
    error: {
      error: `No single talent matched "${query}".`,
      candidates: cands.map((t) => ({ name: t.name, handle: t.handle })),
    },
  };
}

async function resolveCompany(query: string): Promise<{ id?: string; name?: string; error?: Json }> {
  const all = await companyOptions();
  const { hit, candidates } = pickBest(query, all, (c) => c.name);
  if (hit) return { id: hit.id, name: hit.name };
  return {
    error: {
      error: `No single company matched "${query}".`,
      candidates: candidates.map((c) => c.name),
    },
  };
}

async function resolveLead(query: string): Promise<{ lead?: Lead; error?: Json }> {
  const all = await listLeads();
  // Match on name first, then email.
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

// ---- tool schemas -----------------------------------------------------------

export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'data_overview',
    description:
      'Start here for orientation. Returns roster counts (companies, contacts, talent, deals, leads), the agency targets/goal, the years that have booked deals, and which talent have an Instagram connected.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'sales_analytics',
    description:
      'The full sales/analytics report for a year: deals secured ($ and count), agency payout, goal progress, inbound vs outbound, monthly series, top producers, A/R by company, A/P by talent, revenue by source, and a talent×month matrix. This is the deepest financial rollup.',
    input_schema: {
      type: 'object',
      properties: { year: { type: 'integer', description: 'Four-digit year. Omit for the latest year with data.' } },
    },
  },
  {
    name: 'cash_calendar',
    description:
      "The cash calendar from Tulips' real books in I AM CFO: dated money-in (received), money-due (open receivables with true due dates), and money-out (talent/vendor payables). Use for cash-flow questions — what's coming in, who owes us and when, what we owe out, and the net position for a period. Defaults to the current month.",
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD. Omit for the start of the current month.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD. Omit for the end of the current month.' },
      },
    },
  },
  {
    name: 'search_companies',
    description: 'List/search companies (brands & agencies) with their deal count, contact count, and last-booked date.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name search (optional).' },
        type: { type: 'string', enum: ['brand', 'agency', 'other'] },
        status: { type: 'string', enum: ['active', 'prospect', 'inactive'] },
        sortBy: { type: 'string', enum: ['name', 'type', 'category', 'status', 'deal_count', 'contact_count', 'date_last_booked'] },
        limit: { type: 'integer', description: 'Default 40, max 200.' },
      },
    },
  },
  {
    name: 'get_company',
    description: 'Deep profile of one company: record, live booking metrics, its contacts, the talent it has booked, and its deals.',
    input_schema: {
      type: 'object',
      properties: { company: { type: 'string', description: 'Company name (fuzzy-matched).' } },
      required: ['company'],
    },
  },
  {
    name: 'list_talent',
    description: 'The full talent roster with handle, category, payout %, and public/audience info. Use to see who exists or to disambiguate a name.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Optional name/handle filter.' } },
    },
  },
  {
    name: 'get_talent',
    description: 'Deep profile of one creator: record, billing (billed/owed/total), deal count, and their recent deals.',
    input_schema: {
      type: 'object',
      properties: { talent: { type: 'string', description: 'Talent name or @handle (fuzzy-matched).' } },
      required: ['talent'],
    },
  },
  {
    name: 'get_instagram_stats',
    description:
      "Analyze a creator's Instagram once they've connected it: followers, media count, engagement rate, avg likes/comments, reach, views, saves, total interactions, avg story views, audience demographics (gender/age/country), recent posts, and follower growth over time. Use this whenever asked to evaluate a creator's IG, audience fit, or engagement quality.",
    input_schema: {
      type: 'object',
      properties: {
        talent: { type: 'string', description: 'Talent name or @handle (fuzzy-matched).' },
        growth_days: { type: 'integer', description: 'Days of follower history to include (default 90).' },
      },
      required: ['talent'],
    },
  },
  {
    name: 'search_deals',
    description: 'List/search deals (bookings) with company, talent, status, channel, source, budget, and invoice number.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pitched', 'confirmed', 'live', 'completed'] },
        company: { type: 'string', description: 'Filter to one company (fuzzy).' },
        talent: { type: 'string', description: 'Filter to one creator (fuzzy).' },
        from: { type: 'string', description: 'Booking date on/after (YYYY-MM-DD).' },
        to: { type: 'string', description: 'Booking date on/before (YYYY-MM-DD).' },
        limit: { type: 'integer', description: 'Default 60, max 300.' },
      },
    },
  },
  {
    name: 'list_leads',
    description: 'The inbound/outbound lead pipeline: name, company, source, talent of interest, pitch history, and who is due next.',
    input_schema: { type: 'object', properties: { limit: { type: 'integer', description: 'Default 60.' } } },
  },
  {
    name: 'get_lead',
    description:
      'Full context for one lead: their message, talent of interest, source, and the complete pitch/outreach history. Read this before drafting a follow-up or pitch so the draft is grounded in what has actually been said.',
    input_schema: {
      type: 'object',
      properties: { lead: { type: 'string', description: 'Lead name or email (fuzzy-matched).' } },
      required: ['lead'],
    },
  },
  {
    name: 'save_draft',
    description:
      "Save an outreach email you've composed as a DRAFT. This does NOT send anything — the draft lands in the team's Drafts review page (/crm/assistant/drafts) for a human to read and send from their own mail. Compose the full subject and body yourself first (grounded in get_lead / get_talent), then call this once. Link it to the lead/talent/company you wrote it for when you can.",
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['pitch', 'follow_up', 'reply', 'other'], description: 'What kind of email this is.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'The full email body, ready to send as-is.' },
        to_name: { type: 'string', description: 'Recipient name, if known.' },
        to_email: { type: 'string', description: 'Recipient email, if known.' },
        lead: { type: 'string', description: 'Lead this is for (name/email), to link the draft. Optional.' },
        talent: { type: 'string', description: 'Talent this pitch features (name/@handle), to link the draft. Optional.' },
        company: { type: 'string', description: 'Company being pitched, to link the draft. Optional.' },
      },
      required: ['kind', 'subject', 'body'],
    },
  },
  {
    name: 'talent_performance',
    description: 'Roster performance ranking: per-talent deals, completed, amount billed, amount owed, total.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'company_performance',
    description: 'Per-company performance ranking: deals, amount billed, amount owed, total.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'content_schedule',
    description: 'Content calendar. With a talent, that creator\'s posts; without, the whole roster\'s scheduled/published posts (platform, caption, status, dates).',
    input_schema: {
      type: 'object',
      properties: {
        talent: { type: 'string', description: 'Optional creator (fuzzy). Omit for the whole roster.' },
        limit: { type: 'integer', description: 'Default 60.' },
      },
    },
  },
  {
    name: 'remember',
    description:
      "Save a durable fact worth carrying across every future conversation — a standing preference, a fact about a talent or brand, or how the agency likes to work (e.g. 'The owner prefers pitches under 120 words', 'Brand X only books Q4', 'Talent Y won't do alcohol deals'). These load into your memory automatically next time. Only save things that stay true over time — never transient details from the current chat, and don't duplicate something you already remember.",
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact, stated plainly and self-contained.' },
        category: {
          type: 'string',
          enum: ['business', 'talent', 'brand', 'preference', 'general'],
          description: 'What kind of fact this is.',
        },
        subject: { type: 'string', description: 'Who/what it is about (e.g. a talent or brand name). Optional.' },
        talent: { type: 'string', description: 'Talent it concerns (name/@handle), to link it. Optional.' },
        company: { type: 'string', description: 'Company it concerns (name), to link it. Optional.' },
      },
      required: ['content'],
    },
  },
  {
    name: 'delegate',
    description:
      "Hand a focused brief to a specialist on your team and get their report back. Specialists: growth_analyst (a creator's IG + deals → prioritized growth moves), deal_matchmaker (match brands/leads to the right creators, who to pitch), content_strategist (content plan + sample captions per platform), performance_reviewer (a shareable monthly per-talent review). When asked to improve or work on a creator (or the roster), assemble the relevant specialists — one delegate call each with a specific brief — then synthesize their reports into one prioritized plan. Name the creator/context in the brief; the specialist can't see this conversation.",
    input_schema: {
      type: 'object',
      properties: {
        specialist: {
          type: 'string',
          enum: ['growth_analyst', 'deal_matchmaker', 'content_strategist', 'performance_reviewer'],
        },
        brief: {
          type: 'string',
          description: 'A self-contained brief: who/what to work on and what you want back.',
        },
      },
      required: ['specialist', 'brief'],
    },
  },
];

export const TOOL_LABELS: Record<string, string> = {
  data_overview: 'Getting oriented',
  sales_analytics: 'Reading the sales report',
  cash_calendar: 'Reading the cash calendar',
  search_companies: 'Searching companies',
  get_company: 'Reading company profile',
  list_talent: 'Reading the roster',
  get_talent: 'Reading talent profile',
  get_instagram_stats: 'Analyzing Instagram',
  search_deals: 'Reading deals',
  list_leads: 'Reading the lead pipeline',
  get_lead: 'Reading the lead',
  save_draft: 'Saving a draft',
  talent_performance: 'Ranking talent performance',
  company_performance: 'Ranking company performance',
  content_schedule: 'Reading the content calendar',
  remember: 'Saving to memory',
  delegate: 'Consulting the team',
};

// ---- dispatch ---------------------------------------------------------------

const clamp = (n: unknown, def: number, max: number) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : def;
};

async function dispatch(name: string, input: Json): Promise<unknown> {
  switch (name) {
    case 'data_overview': {
      const [counts, settings, analytics, talent] = await Promise.all([
        getCrmCounts(),
        getAgencySettings(),
        getSalesAnalytics(),
        listTalent(),
      ]);
      // Which talent have an IG connected (so Zordon knows what she can analyze).
      const igFlags = await Promise.all(
        talent.map(async (t) => ({
          name: t.name,
          handle: t.handle,
          instagram_connected: Boolean(await getInstagramGraphConnection(t.id)),
        })),
      );
      return {
        counts,
        settings,
        availableYears: analytics.availableYears,
        latestYearWithData: analytics.year,
        instagram: igFlags,
      };
    }

    case 'sales_analytics': {
      const year = input.year != null ? Number(input.year) : undefined;
      return getSalesAnalytics(Number.isFinite(year as number) ? (year as number) : undefined);
    }

    case 'cash_calendar': {
      const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
      const now = new Date();
      const from = isDate(input.from)
        ? input.from
        : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const to = isDate(input.to)
        ? input.to
        : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

      const result = await getCashCalendar({ from, to });
      if (result.status === 'not_configured')
        return { configured: false, message: 'The I AM CFO cash-calendar connection is not configured.' };
      if (result.status === 'error') return { error: result.message };

      const events = result.data.events;
      let received = 0, dueIn = 0, paidOut = 0, owedOut = 0;
      for (const e of events) {
        if (e.source === 'ar') e.status === 'paid' ? (received += e.amount) : (dueIn += e.amount);
        else e.status === 'paid' ? (paidOut += e.amount) : (owedOut += e.amount);
      }
      const trim = (pred: (e: typeof events[number]) => boolean) =>
        events
          .filter(pred)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 30)
          .map((e) => ({ date: e.date, name: e.name, amount: e.amount, dueDate: e.dueDate ?? null, reference: e.reference ?? null }));

      return {
        from,
        to,
        summary: {
          received,
          due_in: dueIn,
          paid_out: paidOut,
          owed_out: owedOut,
          net_expected: received + dueIn - (paidOut + owedOut),
        },
        due_receivables: trim((e) => e.source === 'ar' && e.status === 'due'),
        received_payments: trim((e) => e.source === 'ar' && e.status === 'paid'),
        payables_out: trim((e) => e.source === 'ap'),
        event_count: events.length,
      };
    }

    case 'search_companies': {
      const { companies } = await listCompanies({
        search: typeof input.query === 'string' ? input.query : undefined,
        type: (input.type as CompanyType) || undefined,
        status: (input.status as CompanyStatus) || undefined,
        sortBy: (input.sortBy as CompanySort) || undefined,
        limit: clamp(input.limit, 40, 200),
      });
      return { count: companies.length, companies };
    }

    case 'get_company': {
      const r = await resolveCompany(String(input.company ?? ''));
      if (r.error) return r.error;
      const [record, overview, contacts, talent, deals] = await Promise.all([
        getCompanyRecord(r.id!),
        getCompany(r.id!),
        getCompanyContacts(r.id!),
        getCompanyTalent(r.id!),
        listDeals(),
      ]);
      return {
        company: { ...record, ...overview },
        contacts,
        talent,
        deals: deals.filter((d) => d.company_id === r.id),
      };
    }

    case 'list_talent': {
      let all = await listTalent();
      const q = typeof input.query === 'string' ? norm(input.query) : '';
      if (q) all = all.filter((t) => norm(t.name).includes(q) || norm(t.handle ?? '').includes(q));
      return {
        count: all.length,
        talent: all.map((t) => ({
          name: t.name,
          handle: t.handle,
          category: t.category,
          payout_pct: t.payout_pct,
          is_public: t.is_public,
          audience_stats: t.audience_stats,
        })),
      };
    }

    case 'get_talent': {
      const r = await resolveTalent(String(input.talent ?? ''));
      if (r.error) return r.error;
      const t = r.talent!;
      const [billing, deals] = await Promise.all([getTalentBilling(t.id), listDeals()]);
      return {
        talent: {
          name: t.name,
          handle: t.handle,
          category: t.category,
          payout_pct: t.payout_pct,
          is_public: t.is_public,
          audience_stats: t.audience_stats,
          notes: t.notes,
        },
        billing,
        deals: deals.filter((d) => d.talent_id === t.id),
      };
    }

    case 'get_instagram_stats': {
      const r = await resolveTalent(String(input.talent ?? ''));
      if (r.error) return r.error;
      const t = r.talent!;
      const [stats, snapshots, conn] = await Promise.all([
        getInstagramStats(t.id),
        getFollowerSnapshots(t.id, clamp(input.growth_days, 90, 365)),
        getInstagramGraphConnection(t.id),
      ]);
      if (!stats) {
        return {
          talent: t.name,
          connected: Boolean(conn),
          message: conn
            ? 'Instagram is connected but no stats have synced yet.'
            : `${t.name} hasn't connected their Instagram, so there's nothing to analyze yet.`,
        };
      }
      return {
        talent: t.name,
        connected: Boolean(conn),
        stats,
        follower_growth: snapshots,
      };
    }

    case 'search_deals': {
      const [deals, companies, talent] = await Promise.all([
        listDeals({
          from: typeof input.from === 'string' ? input.from : null,
          to: typeof input.to === 'string' ? input.to : null,
        }),
        companyOptions(),
        listTalent(),
      ]);
      const companyName = new Map(companies.map((c) => [c.id, c.name]));
      const talentName = new Map(talent.map((t) => [t.id, t.name]));

      let rows = deals;
      if (input.status) rows = rows.filter((d) => d.status === (input.status as DealStatus));
      if (input.company) {
        const cr = await resolveCompany(String(input.company));
        if (cr.error) return cr.error;
        rows = rows.filter((d) => d.company_id === cr.id);
      }
      if (input.talent) {
        const tr = await resolveTalent(String(input.talent));
        if (tr.error) return tr.error;
        rows = rows.filter((d) => d.talent_id === tr.talent!.id);
      }
      const limited = rows.slice(0, clamp(input.limit, 60, 300));
      return {
        count: rows.length,
        returned: limited.length,
        deals: limited.map((d) => ({
          company: companyName.get(d.company_id) ?? 'Unknown',
          talent: talentName.get(d.talent_id) ?? 'Unknown',
          booking_date: d.booking_date,
          status: d.status,
          channel: d.channel,
          source: d.source,
          budget: d.budget,
          invoice_number: d.invoice_number,
          live_url: d.live_url,
        })),
      };
    }

    case 'list_leads': {
      const leads = await listLeads();
      return { count: leads.length, leads: leads.slice(0, clamp(input.limit, 60, 300)) };
    }

    case 'get_lead': {
      const r = await resolveLead(String(input.lead ?? ''));
      if (r.error) return r.error;
      return { lead: r.lead };
    }

    case 'save_draft': {
      const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
      const body = typeof input.body === 'string' ? input.body.trim() : '';
      if (!subject || !body) return { error: 'A draft needs both a subject and a body.' };
      const kind: DraftKind = ['pitch', 'follow_up', 'reply', 'other'].includes(input.kind as string)
        ? (input.kind as DraftKind)
        : 'other';

      // Resolve optional context links; ignore ones that don't cleanly match so
      // saving never fails just because a name was fuzzy.
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
      let talent_id: string | null = null;
      if (input.talent) {
        const tr = await resolveTalent(String(input.talent));
        if (tr.talent) talent_id = tr.talent.id;
      }
      let company_id: string | null = null;
      if (input.company) {
        const cr = await resolveCompany(String(input.company));
        if (cr.id) company_id = cr.id;
      }

      const saved = await createAssistantDraft({
        kind,
        subject,
        body,
        to_name,
        to_email,
        lead_id,
        talent_id,
        company_id,
      });
      if ('error' in saved) return saved;
      return {
        saved: true,
        id: saved.id,
        message: 'Draft saved. It is in the Drafts review page — nothing was sent.',
        review_url: '/crm/assistant/drafts',
        to_name,
        to_email,
        subject,
      };
    }

    case 'talent_performance':
      return { ranking: await talentPerformance() };

    case 'company_performance':
      return { ranking: await companyPerformance() };

    case 'content_schedule': {
      const limit = clamp(input.limit, 60, 300);
      if (input.talent) {
        const r = await resolveTalent(String(input.talent));
        if (r.error) return r.error;
        const posts = await getContentPosts(r.talent!.id);
        return { talent: r.talent!.name, count: posts.length, posts: posts.slice(0, limit) };
      }
      const posts = await getAllContentPosts();
      return { count: posts.length, posts: posts.slice(0, limit) };
    }

    case 'remember': {
      const content = typeof input.content === 'string' ? input.content.trim() : '';
      if (!content) return { error: 'Nothing to remember — content was empty.' };
      const category: MemoryCategory = ['business', 'talent', 'brand', 'preference', 'general'].includes(
        input.category as string,
      )
        ? (input.category as MemoryCategory)
        : 'general';

      let talent_id: string | null = null;
      let subject = typeof input.subject === 'string' ? input.subject : null;
      if (input.talent) {
        const tr = await resolveTalent(String(input.talent));
        if (tr.talent) {
          talent_id = tr.talent.id;
          subject = subject ?? tr.talent.name;
        }
      }
      let company_id: string | null = null;
      if (input.company) {
        const cr = await resolveCompany(String(input.company));
        if (cr.id) {
          company_id = cr.id;
          subject = subject ?? cr.name ?? null;
        }
      }

      const saved = await createAssistantMemory({ content, category, subject, talent_id, company_id });
      if ('error' in saved) return saved;
      return { remembered: true, id: saved.id, content, message: "Saved. I'll remember this next time too." };
    }

    case 'delegate': {
      const specialist = String(input.specialist ?? '');
      const brief = typeof input.brief === 'string' ? input.brief.trim() : '';
      if (!SPECIALIST_KEYS.includes(specialist))
        return { error: `Unknown specialist. Options: ${SPECIALIST_KEYS.join(', ')}.` };
      if (!brief) return { error: 'Give the specialist a self-contained brief.' };
      // Specialists get the read registry minus `delegate` (no recursion).
      const registry = {
        tools: ASSISTANT_TOOLS.filter((t) => t.name !== 'delegate'),
        run: runAssistantTool,
      };
      return runSpecialist(specialist, brief, registry);
    }

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
