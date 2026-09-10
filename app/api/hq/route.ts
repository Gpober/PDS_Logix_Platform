import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { createServiceSupabase, serviceConfigured } from '@/lib/supabase/service';
import { productionSummaryFromSource, readProduction } from '@/lib/production/source';
import { reconcileProduction, lateArrivals } from '@/lib/production/reconcile';

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
 * treat the full URL as a secret. Unset secret = 403 for everyone.
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

    // ---- Production ---------------------------------------------------------
    // These read Connecteam LIVE for recent windows and fall back to the synced
    // copy only when live is unavailable or the window is older than the live
    // cutoff. Every response carries `source`, so an answer built on these
    // numbers can always say where they came from — and `production_reconcile`
    // exists to prove the two sides agree rather than assume it.

    server.registerTool(
      'production_report',
      {
        description:
          "Units serviced (condition reports and photo sets) for a date range, with breakdowns by location, service type, person, month and day. Reads Connecteam LIVE for recent windows and the synced copy for older ones — check the `source` field and repeat it when quoting a number. Use for 'how many units did we do', 'production at Manheim Dallas', 'who's our most productive tech', or a piecework payroll count.",
        inputSchema: z.object({
          from: z.string().describe('Start date, YYYY-MM-DD'),
          to: z.string().describe('End date, YYYY-MM-DD (inclusive)'),
          location: z.string().optional().describe("Filter by location, e.g. 'Manheim Dallas'"),
        }),
      },
      async (args) =>
        run(async () => {
          const { summary, read } = await productionSummaryFromSource({
            from: args.from,
            to: args.to,
            location: args.location,
          });
          return JSON.stringify({
            period: { from: args.from, to: args.to },
            source: read.label,
            live: read.live,
            degraded: read.degraded,
            ...(read.reason ? { caveat: read.reason } : {}),
            total_units: summary.total_units,
            by_location: summary.locations,
            by_service_type: summary.by_service,
            by_person: summary.by_staff,
            by_month: summary.by_month,
            by_day: summary.by_day,
          });
        }),
    );

    server.registerTool(
      'production_entries',
      {
        description:
          'The individual units behind a production number — one row per vehicle serviced (entry number, date, location, person, service type, VIN, model). Use to audit a total or to split production by what was actually done. Same source rules as production_report.',
        inputSchema: z.object({
          from: z.string().describe('Start date, YYYY-MM-DD'),
          to: z.string().describe('End date, YYYY-MM-DD (inclusive)'),
          location: z.string().optional(),
          service_type: z.string().optional().describe("e.g. 'Condition Report' or 'Photos'"),
          staff: z.string().optional().describe('Filter by person name (substring match)'),
          limit: z.number().optional().describe('Max rows, default 100, cap 1000'),
        }),
      },
      async (args) =>
        run(async () => {
          const read = await readProduction({ from: args.from, to: args.to, location: args.location });
          const needle = (s: string | undefined) => (s ?? '').toLowerCase();
          const svc = needle(args.service_type);
          const who = needle(args.staff);
          const rows = read.rows
            .filter((r) => (!svc || (r.service_type ?? '').toLowerCase().includes(svc)))
            .filter((r) => (!who || (r.staff_name ?? '').toLowerCase().includes(who)))
            .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''));
          const limit = cap(args.limit, 100, 1000);
          return JSON.stringify({
            period: { from: args.from, to: args.to },
            source: read.label,
            live: read.live,
            degraded: read.degraded,
            matched: rows.length,
            returned: Math.min(rows.length, limit),
            entries: rows.slice(0, limit).map((r) => ({
              entry: r.external_id,
              date: r.submitted_at?.slice(0, 10) ?? null,
              worker: r.staff_name,
              location: r.location,
              service_type: r.service_type,
              vin_last6: r.vin_last6,
              model: r.model_type,
            })),
          });
        }),
    );

    server.registerTool(
      'production_reconcile',
      {
        description:
          "Congruency check: walks Connecteam live and the stored copy over the same window and names every entry that differs — present in Connecteam but not stored (undercount), stored but gone from Connecteam (a voided submission), or stored with a field that has since been edited. Run this before trusting a payroll period. Read-only; repairing a gap is a re-sync of that range.",
        inputSchema: z.object({
          from: z.string().describe('Start date, YYYY-MM-DD'),
          to: z.string().describe('End date, YYYY-MM-DD (inclusive)'),
          location: z.string().optional(),
        }),
      },
      async (args) =>
        run(async () => {
          const r = await reconcileProduction({ from: args.from, to: args.to, location: args.location });
          return JSON.stringify({
            window: r.window,
            congruent: r.congruent,
            live_read_complete: r.liveComplete,
            connecteam_total: r.liveTotal,
            stored_total: r.storedTotal,
            drift: r.drift,
            missing_from_stored: r.missingInStored.length,
            extra_in_stored: r.extraInStored.length,
            edited_since_sync: r.mismatched.length,
            by_location: r.byLocation.filter((l) => l.missing || l.extra || l.mismatched || l.live !== l.stored),
            samples: {
              missing_from_stored: r.missingInStored.slice(0, 15),
              extra_in_stored: r.extraInStored.slice(0, 15),
              edited_since_sync: r.mismatched.slice(0, 15),
            },
            notes: r.notes,
          });
        }),
    );

    server.registerTool(
      'production_forms',
      {
        description:
          "Which Connecteam forms count as production, and the date each started counting. A location missing from this roster contributes nothing to any production number — this is the first thing to check when a location reports zero. `active_from` is why a newly added location shows no history: it counts forward from that date only.",
        inputSchema: z.object({}),
      },
      async () =>
        run(async () => {
          const { data, error } = await db()
            .from('production_forms')
            .select('form_id, name, active_from, enabled, last_synced_at')
            .order('name');
          if (error) return `Error: ${error.message}`;
          return data?.length ? JSON.stringify(data) : 'No production forms on the roster.';
        }),
    );

    server.registerTool(
      'piecework_payroll',
      {
        description:
          "Piece counts and piece pay per worker for a period — the payroll view of production. Counts come from Connecteam LIVE when the window is recent; rates come from the staff record. A worker whose form name does not match a staff record still appears, with no rate, rather than being dropped from the run. Use for 'what do we owe for this period', a piecework payroll check, or the daily piecework report.",
        inputSchema: z.object({
          from: z.string().describe('Start date, YYYY-MM-DD'),
          to: z.string().describe('End date, YYYY-MM-DD (inclusive)'),
          group: z.enum(['A', 'B']).optional().describe('Payroll period A or B'),
          location: z.string().optional(),
        }),
      },
      async (args) =>
        run(async () => {
          const read = await readProduction({ from: args.from, to: args.to, location: args.location });

          const { data: staffRows, error } = await db()
            .from('staff')
            .select('id, name, payroll_group, unit_rate, hourly_rate, is_active');
          if (error) return `Error: ${error.message}`;
          type StaffRow = {
            id: string;
            name: string | null;
            payroll_group: string | null;
            unit_rate: number | null;
            hourly_rate: number | null;
            is_active: boolean | null;
          };
          const byName = new Map<string, StaffRow>();
          for (const st of (staffRows ?? []) as StaffRow[]) {
            const n = (st.name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (n) byName.set(n, st);
          }

          const pieces = new Map<string, { name: string; pieces: number; locations: Set<string> }>();
          for (const r of read.rows) {
            const name = (r.staff_name ?? '').replace(/\s+/g, ' ').trim();
            const key = name.toLowerCase() || '(no name on form)';
            let bucket = pieces.get(key);
            if (!bucket) {
              bucket = { name: name || 'Unlinked (no name on form)', pieces: 0, locations: new Set() };
              pieces.set(key, bucket);
            }
            bucket.pieces += 1;
            bucket.locations.add(r.location);
          }

          const workers = [...pieces.entries()]
            .map(([key, b]) => {
              const st = byName.get(key);
              const unitRate = st?.unit_rate ?? null;
              return {
                name: b.name,
                linked: Boolean(st),
                payroll_group: st?.payroll_group ?? null,
                locations: [...b.locations].sort(),
                pieces: b.pieces,
                unit_rate: unitRate,
                hourly_rate: st?.hourly_rate ?? null,
                piece_pay: unitRate == null ? null : Math.round(b.pieces * unitRate * 100) / 100,
              };
            })
            // A group filter cannot place an unlinked worker, so they stay in the
            // list and are flagged rather than silently dropped.
            .filter((w) => !args.group || w.payroll_group === args.group || !w.linked)
            .sort((a, b) => b.pieces - a.pieces);

          const unlinked = workers.filter((w) => !w.linked);
          return JSON.stringify({
            period: { from: args.from, to: args.to },
            source: read.label,
            live: read.live,
            degraded: read.degraded,
            ...(read.reason ? { caveat: read.reason } : {}),
            group: args.group ?? 'all',
            total_pieces: workers.reduce((a, w) => a + w.pieces, 0),
            piecework_payroll_estimate: Math.round(
              workers.reduce((a, w) => a + (w.piece_pay ?? 0), 0) * 100,
            ) / 100,
            ...(unlinked.length
              ? { unlinked_warning: `${unlinked.length} worker(s) have production but no matching staff record — their pay rate is unknown.` }
              : {}),
            workers,
          });
        }),
    );

    server.registerTool(
      'production_health',
      {
        description:
          "Whether production data is currently fit to report from: how stale the stored copy is, which forms feed it, which locations have gone quiet after previously producing, and whether any entries are unlinked from staff. Call this BEFORE sending a production or payroll report — a non-empty `warnings` list means a number in that report may be a broken sync rather than a slow day, and the report should say so or wait.",
        inputSchema: z.object({
          from: z.string().optional().describe('Start date, YYYY-MM-DD (default: 7 days ago)'),
          to: z.string().optional().describe('End date, YYYY-MM-DD (default: today)'),
        }),
      },
      async (args) =>
        run(async () => {
          // Omit rather than pass null: an explicit null would override the
          // function's own defaults and select an empty window.
          const params: Record<string, string> = {};
          if (args.from) params.p_from = args.from;
          if (args.to) params.p_to = args.to;
          const { data, error } = await db().rpc('production_health', params);
          if (error) return `Error: ${error.message}`;
          return JSON.stringify(data);
        }),
    );

    server.registerTool(
      'production_late_arrivals',
      {
        description:
          "What a LIVE Connecteam read catches that the nightly copy has not got yet — units logged after the sync ran. On the copy alone those units are invisible and look exactly like a quiet afternoon, so this is the number that shows a live read is earning its keep. Also reports units the copy still holds that Connecteam no longer has (voided since the sync). Use it to answer 'are we still capturing late entries'.",
        inputSchema: z.object({
          from: z.string().describe('Start date, YYYY-MM-DD'),
          to: z.string().describe('End date, YYYY-MM-DD (inclusive)'),
          location: z.string().optional(),
        }),
      },
      async (args) =>
        run(async () => {
          const l = await lateArrivals({ from: args.from, to: args.to, location: args.location, sampleLimit: 50 });
          return JSON.stringify({
            window: l.window,
            connecteam_now: l.live,
            nightly_copy: l.stored,
            logged_after_last_sync: l.capturedLive,
            voided_since_last_sync: l.goneFromConnecteam,
            reliable: l.reliable,
            ...(l.reason ? { caveat: `${l.reason} — treat logged_after_last_sync as a floor, not a total.` } : {}),
            sample: l.entries.slice(0, 20),
          });
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
    : new Response(JSON.stringify({ error: 'forbidden' }), {
        // 403, not 401: a 401 tells MCP clients to attempt an OAuth sign-in
        // flow this server does not have. A bad key should fail flat.
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });

export { guarded as GET, guarded as POST, guarded as DELETE };
