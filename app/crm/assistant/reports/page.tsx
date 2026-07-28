import Link from 'next/link';
import { getCurrentProfile, listAssistantReports } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Reports" />
        <Empty>Reports are owner/admin-only and aren’t available on your account.</Empty>
      </>
    );
  }

  const reports = await listAssistantReports();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Reports</h1>
          <p className="mt-1 text-sm text-stone">Visual reports {ASSISTANT_NAME} has built. Ask for one in chat.</p>
        </div>
        <Link href="/crm/assistant" className="text-sm text-tulip hover:underline">
          ← {ASSISTANT_NAME}
        </Link>
      </div>

      {reports.length === 0 ? (
        <Empty>No reports yet. Ask {ASSISTANT_NAME} something like “build me a report on this month’s jobs” and it’ll show up here.</Empty>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/crm/assistant/reports/${r.id}`}
              className="flex items-center justify-between rounded-2xl border border-line bg-white px-5 py-4 transition-colors hover:border-ink"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{r.title}</p>
                {r.summary && <p className="mt-0.5 truncate text-sm text-stone">{r.summary}</p>}
              </div>
              <span className="ml-4 shrink-0 text-xs text-stone">
                {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {r.blocks.length} block
                {r.blocks.length === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
