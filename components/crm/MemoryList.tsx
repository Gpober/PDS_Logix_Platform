'use client';

import { deleteAssistantMemory } from '@/lib/crm/actions';
import type { AssistantMemory } from '@/lib/crm/types';

const CATEGORY_LABEL: Record<AssistantMemory['category'], string> = {
  business: 'Business',
  talent: 'Talent',
  brand: 'Brand',
  preference: 'Preference',
  general: 'General',
};

export function MemoryList({ memories }: { memories: AssistantMemory[] }) {
  return (
    <div className="space-y-2">
      {memories.map((m) => (
        <div key={m.id} className="flex items-start gap-3 rounded-xl border border-line bg-white p-4">
          <span className="mt-0.5 shrink-0 rounded-full bg-blush/60 px-2.5 py-0.5 text-xs text-tulip-dark">
            {CATEGORY_LABEL[m.category]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink">{m.content}</p>
            {m.subject && <p className="mt-0.5 text-xs text-stone">About: {m.subject}</p>}
          </div>
          <form action={deleteAssistantMemory}>
            <input type="hidden" name="id" value={m.id} />
            <button
              type="submit"
              className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-stone transition-colors hover:border-tulip hover:text-tulip"
            >
              Forget
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
