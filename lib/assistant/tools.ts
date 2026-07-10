import type Anthropic from '@anthropic-ai/sdk';
import {
  getDashboardStats,
  listClients,
  getClient,
  getClientContacts,
  getClientAssets,
  listStaff,
  listAssets,
  listJobs,
  getJob,
  getConditionReport,
  listLeads,
} from '@/lib/crm/data';
import {
  assetLabel,
  JOB_STATUSES,
  SERVICE_TYPES,
  type Client,
  type JobStatus,
  type ServiceType,
} from '@/lib/crm/types';

// The assistant's hands — a read-only tool registry over the CRM. Each tool
// resolves human names to ids server-side, runs under the caller's RLS, and
// returns compact JSON. Nothing here writes.

type Json = Record<string, unknown>;

// UI labels (kept in sync with TOOL_LABELS in AssistantChat.tsx).
export const TOOL_LABELS: Record<string, string> = {
  data_overview: 'Getting oriented',
  list_clients: 'Reading clients',
  get_client: 'Reading client profile',
  list_staff: 'Reading the staff roster',
  list_assets: 'Reading assets',
  list_jobs: 'Reading jobs',
  get_job: 'Reading the job',
  list_leads: 'Reading the lead pipeline',
};

const norm = (s: string) => s.trim().toLowerCase();

function pickBest(query: string, clients: Client[]): { hit?: Client; candidates: Client[] } {
  const q = norm(query);
  const exact = clients.filter((c) => norm(c.name) === q);
  if (exact.length === 1) return { hit: exact[0], candidates: [] };
  const starts = clients.filter((c) => norm(c.name).startsWith(q));
  if (starts.length === 1) return { hit: starts[0], candidates: [] };
  const includes = clients.filter((c) => norm(c.name).includes(q));
  if (includes.length === 1) return { hit: includes[0], candidates: [] };
  return {
    hit: undefined,
    candidates: (exact.length ? exact : starts.length ? starts : includes).slice(0, 8),
  };
}

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
    input_schema: {
      type: 'object',
      properties: { search: { type: 'string', description: 'Optional name filter.' } },
    },
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
    name: 'list_staff',
    description: 'The staff roster: name, title, contact info, and active flag.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_assets',
    description:
      'All assets (vehicles) across clients: year/make/model, VIN, plate, mileage, and owning client.',
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
];

export async function runAssistantTool(name: string, input: unknown): Promise<string> {
  const args = (input ?? {}) as Json;
  try {
    switch (name) {
      case 'data_overview':
        return JSON.stringify(await getDashboardStats());

      case 'list_clients':
        return JSON.stringify(await listClients(typeof args.search === 'string' ? args.search : undefined));

      case 'get_client': {
        const query = String(args.name ?? '');
        const all = await listClients();
        const byId = all.find((c) => c.id === query);
        const chosen = byId ?? pickBest(query, all).hit;
        if (!chosen) {
          return JSON.stringify({
            error: `No single client matched "${query}".`,
            candidates: pickBest(query, all).candidates.map((c) => c.name),
          });
        }
        const [full, contacts, assets] = await Promise.all([
          getClient(chosen.id),
          getClientContacts(chosen.id),
          getClientAssets(chosen.id),
        ]);
        return JSON.stringify({
          client: full,
          contacts,
          assets: assets.map((a) => ({ id: a.id, label: assetLabel(a), vin: a.vin, mileage: a.mileage })),
        });
      }

      case 'list_staff':
        return JSON.stringify(await listStaff());

      case 'list_assets':
        return JSON.stringify(await listAssets());

      case 'list_jobs': {
        const status = JOB_STATUSES.includes(args.status as JobStatus)
          ? (args.status as JobStatus)
          : undefined;
        let jobs = await listJobs(status);
        if (SERVICE_TYPES.includes(args.service_type as ServiceType)) {
          jobs = jobs.filter((j) => j.service_type === args.service_type);
        }
        return JSON.stringify(jobs);
      }

      case 'get_job': {
        const id = String(args.id ?? '');
        const [job, report] = await Promise.all([getJob(id), getConditionReport(id)]);
        if (!job) return JSON.stringify({ error: `No job with id "${id}".` });
        return JSON.stringify({ job, condition_report: report });
      }

      case 'list_leads':
        return JSON.stringify(await listLeads());

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : 'Tool failed.' });
  }
}
