import type { SupabaseClient } from '@supabase/supabase-js';

// Build a compact text snapshot of the business for the crew to reason over.
// The worker has no request-scoped RLS, so it gathers the data itself with the
// service-role client and hands the specialists plain text (no live tools).

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

interface JobRow {
  status: string;
  service_type: string;
  scheduled_date: string | null;
  completed_date: string | null;
  clients: { name: string } | null;
  job_pricing: { price: number | null; cost: number | null } | null;
}

export async function buildSnapshot(sb: SupabaseClient): Promise<string> {
  const [{ data: jobsData }, { data: clientsData }, { data: leadsData }, { count: staffCount }] = await Promise.all([
    sb.from('jobs').select('status, service_type, scheduled_date, completed_date, clients(name), job_pricing(price, cost)').order('created_at', { ascending: false }),
    sb.from('clients').select('id, name, category'),
    sb.from('leads').select('name, company, service_type, message, created_at').order('created_at', { ascending: false }).limit(25),
    sb.from('staff').select('*', { count: 'exact', head: true }),
  ]);

  const jobs = (jobsData ?? []) as unknown as JobRow[];
  const clients = (clientsData ?? []) as { id: string; name: string; category: string | null }[];
  const leads = (leadsData ?? []) as { name: string; company: string | null; service_type: string | null; message: string | null; created_at: string }[];

  const byStatus: Record<string, number> = {};
  const byService: Record<string, number> = {};
  let pipeline = 0;
  let invoiced = 0;
  let margin = 0;
  let marginCount = 0;
  const perClient = new Map<string, { jobs: number; value: number }>();
  const completedNotInvoiced: string[] = [];

  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
    byService[j.service_type] = (byService[j.service_type] ?? 0) + 1;
    const price = Number(j.job_pricing?.price ?? 0);
    const cost = Number(j.job_pricing?.cost ?? 0);
    if (j.status === 'invoiced') invoiced += price;
    else pipeline += price;
    if (j.job_pricing?.price != null && j.job_pricing?.cost != null) {
      margin += price - cost;
      marginCount += 1;
    }
    const cname = j.clients?.name ?? 'Unknown';
    const row = perClient.get(cname) ?? { jobs: 0, value: 0 };
    row.jobs += 1;
    row.value += price;
    perClient.set(cname, row);
    if (j.status === 'completed') completedNotInvoiced.push(`${cname} · ${j.service_type}${price ? ` · ${usd(price)}` : ''}`);
  }

  const topClients = [...perClient.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 8)
    .map(([name, r]) => `- ${name}: ${r.jobs} jobs, ${usd(r.value)}`);

  const lines: string[] = [];
  lines.push(`Business: PDS Logix — vehicle field service (condition reports, detailing, biohazard).`);
  lines.push(`Counts: ${clients.length} clients, ${staffCount ?? 0} staff, ${jobs.length} jobs, ${leads.length} recent leads.`);
  lines.push('');
  lines.push(`Jobs by status: ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
  lines.push(`Jobs by service type: ${Object.entries(byService).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
  lines.push(`Pipeline (not yet invoiced): ${usd(pipeline)}. Invoiced: ${usd(invoiced)}.`);
  lines.push(`Total margin (price − cost) over ${marginCount} priced jobs: ${usd(margin)}${marginCount ? ` (avg ${usd(margin / marginCount)})` : ''}.`);
  lines.push('');
  lines.push('Top clients by value:');
  lines.push(...(topClients.length ? topClients : ['- (none)']));
  lines.push('');
  lines.push(`Completed but NOT yet invoiced (${completedNotInvoiced.length}):`);
  lines.push(...(completedNotInvoiced.slice(0, 20).map((s) => `- ${s}`)) );
  if (!completedNotInvoiced.length) lines.push('- (none)');
  lines.push('');
  lines.push(`Recent inbound leads (${leads.length}):`);
  lines.push(
    ...(leads.length
      ? leads.slice(0, 15).map((l) => `- ${l.name}${l.company ? ` (${l.company})` : ''}${l.service_type ? ` · wants ${l.service_type}` : ''}${l.message ? ` — “${l.message.slice(0, 120)}”` : ''}`)
      : ['- (none)']),
  );

  return lines.join('\n');
}
