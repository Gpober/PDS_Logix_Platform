import Link from 'next/link';
import { getCurrentProfile, listAssistantDrafts } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { DraftCard } from '@/components/crm/DraftCard';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

export const dynamic = 'force-dynamic';

export default async function DraftsPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Drafts" />
        <Empty>Drafts are owner/admin-only and aren’t available on your account.</Empty>
      </>
    );
  }

  const drafts = await listAssistantDrafts();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Drafts</h1>
          <p className="mt-1 text-sm text-stone">
            Outreach {ASSISTANT_NAME} composed. Nothing here has been sent — review, copy, and send from
            your own mail.
          </p>
        </div>
        <Link href="/crm/assistant" className="text-sm text-tulip hover:underline">
          ← Back to {ASSISTANT_NAME}
        </Link>
      </div>

      {drafts.length === 0 ? (
        <Empty>
          No drafts yet. Ask {ASSISTANT_NAME} to draft a follow-up or a pitch and it’ll show up here.
        </Empty>
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <DraftCard key={d.id} draft={d} />
          ))}
        </div>
      )}
    </>
  );
}
