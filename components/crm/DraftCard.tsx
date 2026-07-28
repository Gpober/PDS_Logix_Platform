'use client';

import { useState } from 'react';
import type { AssistantDraft } from '@/lib/crm/types';

const KIND_LABELS: Record<string, string> = {
  follow_up: 'Follow-up',
  quote: 'Quote',
  reply: 'Reply',
  other: 'Draft',
};

// One saved outreach draft. Nothing sends from here — the team copies the body
// and sends from their own mail.
export function DraftCard({ draft }: { draft: AssistantDraft }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blush px-2.5 py-0.5 text-xs text-tulip-dark">
          {KIND_LABELS[draft.kind] ?? 'Draft'}
        </span>
        {(draft.to_name || draft.to_email) && (
          <span className="text-xs text-stone">
            To: {draft.to_name ?? draft.to_email}
            {draft.to_name && draft.to_email ? ` · ${draft.to_email}` : ''}
          </span>
        )}
        <span className="ml-auto text-xs text-stone">
          {new Date(draft.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <p className="font-medium text-ink">{draft.subject}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-stone">{draft.body}</p>
      <button
        onClick={copy}
        className="mt-3 rounded-full border border-line px-3 py-1.5 text-xs text-stone hover:border-ink hover:text-ink"
      >
        {copied ? 'Copied ✓' : 'Copy subject + body'}
      </button>
    </div>
  );
}
