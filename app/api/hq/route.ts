import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { createServiceSupabase, serviceConfigured } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * PDS Logix HQ — a remote MCP server for claude.ai custom connectors,
 * exposing a read-only view of the operations CRM (Zordon in the app
 * remains the writer).
 *
 * Auth: the connector URL carries `?key=<MCP_CONNECTOR_SECRET>`, checked on
 * every request. claude.ai custom connectors cannot send custom headers
 * without OAuth, so the long random token in the URL is the credential —
 * treat the full URL as a secret. Unset secret = 401 for everyone.
 */

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });

function db() {
  if (!serviceConfigured()) {
    throw new Error('Connector not configured — SUPABASE_SERVICE_ROLE_KEY is missing.');
  }
  return createServiceSupabase();
}

const cap = (n: number | undefined, dflt: number, max: number) =>
  Math.min(max, Math.max(1, n ?? dflt));

async function run(fn: () => Promise<string>): Promise<{ content: { type: 'text'; text: string }[] }> {
  try {
    return text(await fn());
  } catch (e) {
    return text(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'ops_snapshot',
      {
        description:
          "Counts across the PDS Logix operations CRM: clients, jobs by status, staff, assets, and leads. Start here for 'how is the business doing'.",
        inputSchema: z.object({}),
      },
      async () =>
        run(async () => {
          const supabase = db();
          const out: Record<string, unknown> = {};
          for (const table of ['clients', 'staff', 'assets', 'leads']) {
            const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
            out[table] = error ? `error: ${error.message}` : (count ?? 0);
          }
          const { data: jobs, error: jobsError } = await supabase.from('jobs').select('status');
          if (jobsError) {
            out.jobs = `error: ${jobsError.message}`;
          } else {
            const byStatus: Record<string, number> = {};
            for (const row of jobs ?? []) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
            out.jobsByStatus = byStatus;
          }
          return JSON.stringify(out);
        }),
    );

    server.registerTool(
      'list_jobs',
      {
        description: 'Service jobs, optionally filtered by status.',
        inputSchema: z.object({
          status: z
            .enum(['requested', 'scheduled', 'in_progress', 'completed', 'invoiced'])
            .optional(),
          limit: z.number().optional().describe('Max rows, default 25, cap 100'),
        }),
      },
      async (args) =>
        run(async () => {
          let query = db().from('jobs').select('*').limit(cap(args.limit, 25, 100));
          if (args.status) query = query.eq('status', args.status);
          const { data, error } = await query;
          if (error) return `Error: ${error.message}`;
          return data?.length ? JSON.stringify(data) : 'No jobs match.';
        }),
    );

    server.registerTool(
      'list_clients',
      {
        description: 'Dealers, fleets, and insurers. Optionally filter by name.',
        inputSchema: z.object({
          name: z.string().optional().describe('Name filter, partial ok'),
          limit: z.number().optional().describe('Max rows, default 25, cap 100'),
        }),
      },
      async (args) =>
        run(async () => {
          let query = db().from('clients').select('*').limit(cap(args.limit, 25, 100));
          if (args.name) query = query.ilike('name', `%${args.name}%`);
          const { data, error } = await query;
          if (error) return `Error: ${error.message}`;
          return data?.length ? JSON.stringify(data) : 'No clients match.';
        }),
    );

    server.registerTool(
      'list_leads',
      {
        description: 'The inbound lead pipeline.',
        inputSchema: z.object({
          limit: z.number().optional().describe('Max rows, default 25, cap 100'),
        }),
      },
      async (args) =>
        run(async () => {
          const { data, error } = await db().from('leads').select('*').limit(cap(args.limit, 25, 100));
          if (error) return `Error: ${error.message}`;
          return data?.length ? JSON.stringify(data) : 'No leads.';
        }),
    );

    server.registerTool(
      'list_staff',
      {
        description: 'Technicians and inspectors.',
        inputSchema: z.object({}),
      },
      async () =>
        run(async () => {
          const { data, error } = await db().from('staff').select('*').limit(100);
          if (error) return `Error: ${error.message}`;
          return data?.length ? JSON.stringify(data) : 'No staff.';
        }),
    );
  },
  {
    serverInfo: { name: 'pds-logix-hq', version: '1.0.0' },
  },
);

function authorized(request: Request): boolean {
  const secret = process.env.MCP_CONNECTOR_SECRET;
  if (!secret) return false; // unconfigured = closed
  return new URL(request.url).searchParams.get('key') === secret;
}

const guarded = (request: Request) =>
  authorized(request)
    ? handler(request)
    : new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });

export { guarded as GET, guarded as POST, guarded as DELETE };
