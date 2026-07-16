import { getOpenTimeEntries, getRecentTimeEntries, staffOptions, listJobs } from '@/lib/crm/data';
import { clockIn, clockOut, deleteTimeEntry } from '@/lib/crm/actions';
import { SERVICE_LABELS } from '@/lib/crm/types';
import { formatDate, formatTime, formatDurationMs } from '@/lib/format';
import { CrmHeader, Table, Th, Td, Empty, Select } from '@/components/crm/ui';
import { Elapsed } from '@/components/crm/Elapsed';

export const dynamic = 'force-dynamic';

// Start of the current week (Mon 00:00) for the hours summary.
function weekStart(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export default async function TimePage() {
  const [open, recent, staff, jobs] = await Promise.all([
    getOpenTimeEntries(),
    getRecentTimeEntries(100),
    staffOptions(),
    listJobs(),
  ]);

  const staffOpts = staff.map((s) => ({ value: s.id, label: s.name }));
  const jobOpts = jobs.map((j) => ({
    value: j.id,
    label: `${SERVICE_LABELS[j.service_type]} · ${j.client_name ?? 'job'}`,
  }));

  // Hours this week per staff (closed entries only).
  const since = weekStart();
  const totals = new Map<string, { name: string; ms: number }>();
  for (const e of recent) {
    if (!e.duration_ms) continue;
    if (new Date(e.clock_in).getTime() < since) continue;
    const cur = totals.get(e.staff_id) ?? { name: e.staff_name ?? '—', ms: 0 };
    cur.ms += e.duration_ms;
    totals.set(e.staff_id, cur);
  }
  const weekly = [...totals.values()].sort((a, b) => b.ms - a.ms);

  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Time Clock" />

      {/* Clock in */}
      <form
        action={clockIn}
        className="mb-6 grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <Select label="Staff member" name="staff_id" options={staffOpts} required placeholder="Select staff" />
        <Select label="Job (optional)" name="job_id" options={jobOpts} placeholder="No job" />
        <button className="rounded-full bg-ink px-6 py-2.5 text-sm text-ivory hover:bg-tulip">
          Clock in
        </button>
      </form>

      {/* Currently clocked in */}
      <h2 className="mb-3 font-display text-xl">On the clock</h2>
      {open.length === 0 ? (
        <Empty>Nobody is clocked in right now.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {open.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-2xl border border-line bg-white p-4"
            >
              <div>
                <div className="font-medium">{e.staff_name}</div>
                <div className="text-sm text-stone">
                  Since {formatTime(e.clock_in)}
                  {e.job_label ? ` · ${e.job_label}` : ''}
                </div>
                <div className="mt-1 text-lg text-tulip">
                  <Elapsed since={e.clock_in} />
                </div>
              </div>
              <form action={clockOut.bind(null, e.id)}>
                <button className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink">
                  Clock out
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Hours this week */}
      <h2 className="mb-3 mt-8 font-display text-xl">Hours this week</h2>
      {weekly.length === 0 ? (
        <Empty>No completed time entries this week yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Staff</Th>
              <Th>Hours</Th>
            </tr>
          }
        >
          {weekly.map((w) => (
            <tr key={w.name}>
              <Td>{w.name}</Td>
              <Td>{formatDurationMs(w.ms)}</Td>
            </tr>
          ))}
        </Table>
      )}

      {/* Recent entries */}
      <h2 className="mb-3 mt-8 font-display text-xl">Recent entries</h2>
      {recent.length === 0 ? (
        <Empty>No time entries yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Staff</Th>
              <Th>Job</Th>
              <Th>Date</Th>
              <Th>In</Th>
              <Th>Out</Th>
              <Th>Duration</Th>
              <Th>{' '}</Th>
            </tr>
          }
        >
          {recent.map((e) => (
            <tr key={e.id} className="hover:bg-blush/30">
              <Td>{e.staff_name}</Td>
              <Td>{e.job_label ?? '—'}</Td>
              <Td>{formatDate(e.clock_in)}</Td>
              <Td>{formatTime(e.clock_in)}</Td>
              <Td>{e.clock_out ? formatTime(e.clock_out) : <span className="text-tulip">Active</span>}</Td>
              <Td>{e.clock_out ? formatDurationMs(e.duration_ms) : '—'}</Td>
              <Td>
                <form action={deleteTimeEntry.bind(null, e.id)}>
                  <button className="text-xs text-stone hover:text-tulip">Delete</button>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
