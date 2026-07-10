import { getCurrentProfile } from '@/lib/crm/data';
import { assistantConfigured } from '@/lib/assistant/llm';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { AssistantChat } from '@/components/crm/AssistantChat';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

export const dynamic = 'force-dynamic';

export default async function AssistantPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return (
      <>
        <CrmHeader title={ASSISTANT_NAME} />
        <Empty>The assistant is owner/admin-only and isn’t available on your account.</Empty>
      </>
    );
  }

  if (!assistantConfigured()) {
    return (
      <>
        <CrmHeader title={ASSISTANT_NAME} />
        <Empty>
          The assistant isn’t configured yet. Add an <code>ANTHROPIC_API_KEY</code> in the environment to
          switch it on.
        </Empty>
      </>
    );
  }

  return <AssistantChat userName={profile?.full_name} />;
}
