'use client';

import { useEffect, useRef, useState } from 'react';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[]; // labels of tools read while producing this answer
}

// Kept in sync with TOOL_LABELS in lib/assistant/tools.ts. Duplicated here so
// the client bundle never imports the server-only tools module.
const TOOL_LABELS: Record<string, string> = {
  data_overview: 'Getting oriented',
  list_clients: 'Reading clients',
  get_client: 'Reading client profile',
  list_staff: 'Reading the staff roster',
  list_assets: 'Reading assets',
  list_jobs: 'Reading jobs',
  get_job: 'Reading the job',
  list_leads: 'Reading the lead pipeline',
};
const labelFor = (name: string) => TOOL_LABELS[name] ?? name;

const STARTERS = [
  'How are we doing right now — jobs, pipeline, and invoiced totals?',
  'Which jobs are scheduled but not yet completed?',
  'Show me our biggest clients by number of jobs.',
  'What inbound leads have come in, and what do they want?',
];

export function AssistantChat({ userName }: { userName?: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages([...next, { role: 'assistant', content: '', tools: [] }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        let err = 'Something went wrong.';
        try {
          err = (await res.json()).error ?? err;
        } catch {
          /* non-JSON */
        }
        patchLast((m) => ({ ...m, content: err }));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { t: string; v: string };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.t === 'text') patchLast((m) => ({ ...m, content: m.content + ev.v }));
          else if (ev.t === 'tool')
            patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), labelFor(ev.v)] }));
          else if (ev.t === 'error')
            patchLast((m) => ({ ...m, content: m.content + `\n\n[${ev.v}]` }));
        }
      }
    } catch {
      patchLast((m) => ({ ...m, content: m.content || 'Couldn’t reach the assistant. Try again.' }));
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] max-w-3xl flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{ASSISTANT_NAME}</span>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div>
              <h1 className="font-display text-3xl">{ASSISTANT_NAME}</h1>
              <p className="mt-2 max-w-md text-sm text-stone">
                Your PDS Logix operations assistant{userName ? `, ${userName.split(' ')[0]}` : ''}. Ask
                about jobs, clients, staff, assets, or leads — it reads live from the CRM.
              </p>
            </div>
            <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-line bg-white px-4 py-3 text-left text-sm text-ink transition-colors hover:border-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const last = i === messages.length - 1;
            const activity = m.tools && m.tools.length > 0 ? m.tools[m.tools.length - 1] : null;
            return (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start'}>
                {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                  <div className="mb-1 max-w-[85%] text-xs text-stone">
                    {busy && last && !m.content
                      ? `${activity}…`
                      : `Read: ${[...new Set(m.tools)].join(' · ')}`}
                  </div>
                )}
                <div
                  className={
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ' +
                    (m.role === 'user' ? 'bg-ink text-ivory' : 'border border-line bg-white text-ink')
                  }
                >
                  {m.content || (busy && last ? <span className="text-stone">Thinking…</span> : m.content)}
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-end gap-2 border-t border-line pt-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={`Ask ${ASSISTANT_NAME}…`}
          className="max-h-40 flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-ink px-5 py-2.5 text-sm text-ivory transition-opacity disabled:opacity-40"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
