import { getMyStaff } from '@/lib/crm/data';
import { assistantConfigured } from '@/lib/assistant/llm';
import { ASSISTANT_NAME } from '@/lib/assistant/config';
import { PortalAssistantChat } from '@/components/portal/PortalAssistantChat';

export const dynamic = 'force-dynamic';

export default async function PortalAssistantPage() {
  const staff = (await getMyStaff())!;

  if (!assistantConfigured()) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-stone">
        {ASSISTANT_NAME} isn’t switched on yet. Ask an admin to add an <code>ANTHROPIC_API_KEY</code>.
      </div>
    );
  }

  return <PortalAssistantChat firstName={staff.name.split(' ')[0]} />;
}
