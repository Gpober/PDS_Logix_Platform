import type { AssistantMemory } from '@/lib/crm/types';
import { forgetMemory } from '@/lib/crm/actions';

// Zordon's durable facts, with a one-click forget. Server component — the forget
// button posts the `forgetMemory` server action.
export function MemoryList({ memories }: { memories: AssistantMemory[] }) {
  return (
    <div className="space-y-2">
      {memories.map((m) => (
        <div key={m.id} className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm text-ink">{m.content}</p>
            <p className="mt-1 text-xs text-stone">
              {m.subject ? `${m.category} · ${m.subject}` : m.category} ·{' '}
              {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <form action={forgetMemory}>
            <input type="hidden" name="id" value={m.id} />
            <button className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-stone hover:border-tulip hover:text-tulip">
              Forget
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
