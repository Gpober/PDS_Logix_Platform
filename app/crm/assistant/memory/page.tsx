import Link from 'next/link';
import { getCurrentProfile, listAssistantMemories } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { MemoryList } from '@/components/crm/MemoryList';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

export const dynamic = 'force-dynamic';

export default async function MemoryPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title="Memory" />
        <Empty>Memory is owner/admin-only and isn’t available on your account.</Empty>
      </>
    );
  }

  const memories = await listAssistantMemories();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">Memory</h1>
          <p className="mt-1 text-sm text-stone">
            Durable facts {ASSISTANT_NAME} carries into every conversation. Tell {ASSISTANT_NAME} something worth
            keeping and it lands here; forget anything that’s no longer true.
          </p>
        </div>
        <Link href="/crm/assistant" className="text-sm text-tulip hover:underline">
          ← Back to {ASSISTANT_NAME}
        </Link>
      </div>

      {memories.length === 0 ? (
        <Empty>
          Nothing remembered yet. In chat, tell {ASSISTANT_NAME} a standing fact — e.g. “Dealer North wants condition
          reports within 24h” — and it’ll save it here.
        </Empty>
      ) : (
        <MemoryList memories={memories} />
      )}
    </>
  );
}
