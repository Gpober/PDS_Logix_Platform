'use client';

import { useEffect, useRef, useState } from 'react';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

// Kept in sync with WORKER_TOOL_LABELS in lib/assistant/workerTools.ts. Inlined
// so the client bundle never imports the server-only tools module.
const TOOL_LABELS: Record<string, string> = {
  my_production: 'Reading your production',
  my_goal: 'Checking your goal',
  my_hours: 'Adding up your hours',
  my_recent: 'Reading your recent shifts',
  set_goal: 'Setting your goal',
};
const labelFor = (name: string) => TOOL_LABELS[name] ?? name;

interface PendingAction {
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
  actions?: PendingAction[];
}

const STARTERS = [
  'How am I doing this month?',
  'Am I on track to hit my goal?',
  'Break down my units by service.',
  'How many hours have I worked this month?',
];

export function PortalAssistantChat({ firstName }: { firstName?: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);
  const storageKey = 'zordon-chat:portal';

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Msg[];
        if (Array.isArray(saved) && saved.length) setMessages(saved);
      }
    } catch {
      /* start fresh */
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (messages.length) sessionStorage.setItem(storageKey, JSON.stringify(messages));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* non-fatal */
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const patchLast = (fn: (m: Msg) => Msg) =>
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });

  const updateAction = (mi: number, ai: number, patch: Partial<PendingAction>) =>
    setMessages((prev) =>
      prev.map((m, i) => (i !== mi ? m : { ...m, actions: (m.actions ?? []).map((a, j) => (j !== ai ? a : { ...a, ...patch })) })),
    );

  async function confirmAction(mi: number, ai: number, action: PendingAction) {
    updateAction(mi, ai, { status: 'running' });
    try {
      const res = await fetch('/api/portal/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: action.name, input: action.input }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) updateAction(mi, ai, { status: 'done', result: data.message ?? 'Done.' });
      else updateAction(mi, ai, { status: 'error', result: data.error ?? 'Action failed.' });
    } catch {
      updateAction(mi, ai, { status: 'error', result: 'Couldn’t reach the server.' });
    }
  }

  function newChat() {
    setMessages([]);
    setInput('');
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages([...next, { role: 'assistant', content: '', tools: [] }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/portal/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
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
          let ev: { t: string; v: unknown };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.t === 'text') patchLast((m) => ({ ...m, content: m.content + String(ev.v) }));
          else if (ev.t === 'tool') patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), labelFor(String(ev.v))] }));
          else if (ev.t === 'action') {
            const a = ev.v as { name: string; input: Record<string, unknown> };
            patchLast((m) => ({ ...m, actions: [...(m.actions ?? []), { name: a.name, input: a.input ?? {}, status: 'pending' }] }));
          } else if (ev.t === 'error') patchLast((m) => ({ ...m, content: m.content + `\n\n[${String(ev.v)}]` }));
        }
      }
    } catch {
      patchLast((m) => ({ ...m, content: m.content || 'Couldn’t reach Zordon. Try again.' }));
    } finally {
      setBusy(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-9.5rem)] max-w-2xl flex-col md:h-[calc(100vh-8rem)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">{ASSISTANT_NAME}</span>
        {!empty && (
          <button onClick={newChat} disabled={busy} className="text-xs text-stone hover:text-ink disabled:opacity-40">
            New chat
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div>
              <h1 className="font-display text-3xl">{ASSISTANT_NAME}</h1>
              <p className="mt-2 max-w-sm text-sm text-stone">
                Your coach{firstName ? `, ${firstName}` : ''}. Ask about your numbers, your goal, or your hours — I read
                your own production live and can set your target for you.
              </p>
            </div>
            <div className="grid w-full max-w-md gap-2 sm:grid-cols-2">
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
              <div key={i} className={m.role === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
                {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                  <div className="mb-1 max-w-[85%] text-xs text-stone">
                    {busy && last && !m.content ? `${activity}…` : `Checked: ${[...new Set(m.tools)].join(' · ')}`}
                  </div>
                )}
                <div
                  className={
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ' +
                    (m.role === 'user' ? 'bg-tulip text-ivory' : 'border border-line bg-white text-ink')
                  }
                >
                  {m.content || (busy && last ? <span className="text-stone">Thinking…</span> : m.content)}
                </div>

                {m.actions?.map((a, ai) => (
                  <GoalCard
                    key={ai}
                    action={a}
                    onConfirm={() => confirmAction(i, ai, a)}
                    onCancel={() => updateAction(i, ai, { status: 'error', result: 'Cancelled.' })}
                  />
                ))}
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
          className="rounded-full bg-tulip px-5 py-2.5 text-sm text-ivory transition-opacity disabled:opacity-40"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

// The one gated proposal in the portal: set the worker's own monthly goal.
function GoalCard({ action, onConfirm, onCancel }: { action: PendingAction; onConfirm: () => void; onCancel: () => void }) {
  const { input, status } = action;
  const target = Number(input.target_units);
  const period = typeof input.period === 'string' && input.period ? input.period : null;
  const when = period
    ? new Date(`${period}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : 'every month';

  return (
    <div className="mt-2 max-w-[85%] rounded-2xl border border-tulip/40 bg-blush/40 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-tulip" />
        <span className="font-semibold text-ink">Set your goal</span>
        <span className="text-xs text-stone">· tap to confirm</span>
      </div>
      <div className="text-ink">
        {Number.isFinite(target) ? target.toLocaleString('en-US') : '—'} units <span className="text-stone">· {when}</span>
      </div>

      {status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button onClick={onConfirm} className="rounded-full bg-tulip px-4 py-1.5 text-xs text-ivory hover:bg-tulip-dark">Confirm</button>
          <button onClick={onCancel} className="rounded-full border border-line px-4 py-1.5 text-xs text-stone hover:border-ink">Cancel</button>
        </div>
      )}
      {status === 'running' && <p className="mt-3 text-xs text-stone">Working…</p>}
      {status === 'done' && <p className="mt-3 text-xs font-medium text-[#5B8C5A]">✓ {action.result}</p>}
      {status === 'error' && <p className="mt-3 text-xs text-tulip-dark">{action.result}</p>}
    </div>
  );
}
