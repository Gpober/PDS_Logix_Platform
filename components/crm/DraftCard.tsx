'use client';

import { useState } from 'react';
import { deleteAssistantDraft } from '@/lib/crm/actions';
import type { AssistantDraft } from '@/lib/crm/types';

const KIND_LABEL: Record<AssistantDraft['kind'], string> = {
  pitch: 'Pitch',
  follow_up: 'Follow-up',
  reply: 'Reply',
  other: 'Draft',
};

export function DraftCard({ draft }: { draft: AssistantDraft }) {
  const [copied, setCopied] = useState(false);

  const recipient = draft.to_name
    ? `${draft.to_name}${draft.to_email ? ` <${draft.to_email}>` : ''}`
    : draft.to_email ?? '—';

  async function copy() {
    const text = `Subject: ${draft.subject}\n\n${draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blush/60 px-2.5 py-0.5 text-xs text-tulip-dark">
          {KIND_LABEL[draft.kind]}
        </span>
        <span className="text-xs text-stone">To: {recipient}</span>
        <span className="ml-auto text-xs text-stone">
          {new Date(draft.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      <div className="font-medium text-ink">{draft.subject}</div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-stone">{draft.body}</p>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={copy}
          className="rounded-full border border-line px-3 py-1.5 text-xs text-ink transition-colors hover:border-ink"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <form action={deleteAssistantDraft}>
          <input type="hidden" name="id" value={draft.id} />
          <button
            type="submit"
            className="rounded-full border border-line px-3 py-1.5 text-xs text-stone transition-colors hover:border-tulip hover:text-tulip"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
