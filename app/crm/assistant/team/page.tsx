import Link from 'next/link';
import { getCurrentProfile, listTeamRuns } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { TeamRunsPanel } from '@/components/crm/TeamRunsPanel';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Team" />
        <Empty>The team is owner/admin-only and isn’t available on your account.</Empty>
      </>
    );
  }

  const runs = await listTeamRuns();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Team</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone">
            {ASSISTANT_NAME}’s crew — the Operations Analyst and Pipeline Strategist — working the business in the
            background. Runs process on the worker with no time limit; results land below.
          </p>
        </div>
        <Link href="/crm/assistant" className="text-sm text-tulip hover:underline">
          ← Back to {ASSISTANT_NAME}
        </Link>
      </div>

      <TeamRunsPanel initialRuns={runs} />
    </>
  );
}
