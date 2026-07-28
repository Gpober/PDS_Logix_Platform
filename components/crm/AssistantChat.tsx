'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ASSISTANT_NAME } from '@/lib/assistant/config';

interface PendingAction {
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
}

type ImportRow = { company: string; name?: string; title?: string; email?: string; phone?: string };

interface Attachment {
  url: string; // data URL (empty for text files)
  name: string;
  kind: 'image' | 'pdf' | 'text';
  text?: string; // preview shown to the model for CSV / text files
  contacts?: ImportRow[]; // full rows parsed in the browser (for import_contacts)
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  tools?: string[]; // labels of tools read while producing this answer
  actions?: PendingAction[]; // gated writes awaiting the human's confirmation
}

// Kept in sync with TOOL_LABELS in lib/assistant/tools.ts. Duplicated here so
// the client bundle never imports the server-only tools module.
const TOOL_LABELS: Record<string, string> = {
  data_overview: 'Getting oriented',
  list_clients: 'Reading clients',
  get_client: 'Reading client profile',
  list_contacts: 'Reading contacts',
  list_staff: 'Reading the staff roster',
  list_assets: 'Reading assets',
  list_jobs: 'Reading jobs',
  get_job: 'Reading the job',
  list_leads: 'Reading the lead pipeline',
  get_lead: 'Reading the lead',
  client_performance: 'Ranking client performance',
  job_analytics: 'Analyzing the operation',
  get_invoices: 'Reading invoices',
  get_bills: 'Reading bills',
  find_duplicate_invoices: 'Finding duplicate invoices',
  save_draft: 'Saving a draft',
  remember: 'Saving to memory',
  build_report: 'Building a report',
  delegate: 'Consulting the team',
  create_client: 'Preparing a new client',
  create_contact: 'Preparing a contact',
  create_asset: 'Preparing an asset',
  create_job: 'Preparing a job',
  update_job: 'Preparing a job update',
  invoice_job: 'Preparing to invoice the job',
  create_invoice: 'Preparing an invoice',
  create_bill: 'Preparing a bill',
  update_invoice: 'Preparing an invoice fix',
  delete_invoices: 'Preparing an invoice cleanup',
  import_contacts: 'Preparing a contact import',
};
const labelFor = (name: string) => TOOL_LABELS[name] ?? name;

const STARTERS = [
  'How are we doing right now — jobs, pipeline, and invoiced totals?',
  'Which completed jobs haven’t been invoiced yet?',
  'Show me our biggest clients by number of jobs.',
  'Assemble the team to find where our next revenue is.',
];

// ---- CSV parsing (contacts) ------------------------------------------------

const isTextLike = (file: File): boolean =>
  file.type === 'text/csv' ||
  file.type === 'text/plain' ||
  file.type === 'text/tab-separated-values' ||
  file.type === 'application/vnd.ms-excel' ||
  /\.(csv|tsv|txt)$/i.test(file.name);

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const HEADER_MAP: { key: keyof ImportRow; re: RegExp }[] = [
  { key: 'company', re: /^(client|company|dealer|fleet|insurer|account|organization|org)$/i },
  { key: 'email', re: /e-?mail/i },
  { key: 'phone', re: /(phone|mobile|^tel$|cell)/i },
  { key: 'title', re: /(title|role|position|job)/i },
  { key: 'name', re: /(name|contact|person)/i },
];

function mapHeaders(header: string[]): (keyof ImportRow | null)[] {
  return header.map((h) => {
    const norm = h.trim();
    for (const { key, re } of HEADER_MAP) if (re.test(norm)) return key;
    return null;
  });
}

function parseContactsCsv(text: string, fileName: string): ImportRow[] | null {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const delimiter = /\.tsv$/i.test(fileName) || (firstLine.includes('\t') && !firstLine.includes(',')) ? '\t' : ',';
  const grid = parseDelimited(text, delimiter);
  if (grid.length < 2) return null;
  const cols = mapHeaders(grid[0]);
  if (!cols.includes('company') && !cols.includes('name') && !cols.includes('email')) return null;
  const out: ImportRow[] = [];
  for (let i = 1; i < grid.length && out.length < 5000; i++) {
    const cells = grid[i];
    const rec: ImportRow = { company: '' };
    cols.forEach((key, idx) => {
      if (!key) return;
      const v = (cells[idx] ?? '').trim().replace(/[<>]/g, '');
      if (!v) return;
      (rec as Record<string, unknown>)[key] = v;
    });
    if (!rec.company && rec.email) {
      const dom = rec.email.split('@')[1]?.split('.')[0];
      if (dom) rec.company = dom.charAt(0).toUpperCase() + dom.slice(1);
    }
    if (!rec.company) continue;
    out.push(rec);
  }
  return out.length ? out : null;
}

function contactsPreview(fileName: string, rows: ImportRow[]): string {
  const head = rows.slice(0, 12).map((r) => `${r.company || '—'} | ${r.name || '—'}${r.email ? ` | ${r.email}` : ''}`).join('\n');
  return (
    `[Attached contact sheet: ${fileName}] — ${rows.length} rows parsed (Client / Name / Title / Email / Phone). ` +
    `The app holds the full parsed rows; when you propose import_contacts it will use EVERY row from this file, ` +
    `so you can call import_contacts with an empty contacts array. The import is idempotent (only the missing ` +
    `people get added). Preview (first 12 of ${rows.length}):\n${head}`
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<Attachment | null> {
  if (isTextLike(file)) {
    const raw = (await file.text()).slice(0, 2_000_000);
    const name = file.name || 'data.csv';
    const rows = parseContactsCsv(raw, name);
    if (rows && rows.length) return { url: '', name, kind: 'text', text: contactsPreview(name, rows), contacts: rows };
    return { url: '', name, kind: 'text', text: `[Attached file: ${name}]\n\n${raw.slice(0, 6000)}` };
  }
  if (file.type === 'application/pdf') {
    return { url: await readAsDataUrl(file), name: file.name || 'document.pdf', kind: 'pdf' };
  }
  if (!file.type.startsWith('image/')) return null;
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const MAX = 1568;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    if (scale >= 1) return { url: dataUrl, name: file.name || 'image', kind: 'image' };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { url: dataUrl, name: file.name || 'image', kind: 'image' };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL('image/jpeg', 0.85), name: file.name || 'image', kind: 'image' };
  } catch {
    return { url: dataUrl, name: file.name || 'image', kind: 'image' };
  }
}

function attachmentToBlock(att: Attachment): unknown | null {
  if (att.kind === 'text') return { type: 'text', text: att.text ?? `[Attached file: ${att.name}]` };
  const m = /^data:([^;]+);base64,(.+)$/.exec(att.url);
  if (!m) return null;
  const [, mediaType, data] = m;
  if (att.kind === 'pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

function toApiMessages(msgs: Msg[]): Array<{ role: string; content: unknown }> {
  return msgs.map((m) => {
    if (m.role === 'user' && m.attachments && m.attachments.length) {
      const blocks: unknown[] = [];
      if (m.content.trim()) blocks.push({ type: 'text', text: m.content });
      for (const att of m.attachments) {
        const b = attachmentToBlock(att);
        if (b) blocks.push(b);
      }
      return { role: m.role, content: blocks };
    }
    return { role: m.role, content: m.content };
  });
}

export function AssistantChat({ userName }: { userName?: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);
  const storageKey = 'zordon-chat:pds';

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
      if (messages.length) {
        const slim = messages.map(({ attachments: _a, ...rest }) => rest);
        sessionStorage.setItem(storageKey, JSON.stringify(slim));
      } else sessionStorage.removeItem(storageKey);
    } catch {
      /* non-fatal */
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  function newChat() {
    setMessages([]);
    setInput('');
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

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
      const res = await fetch('/api/assistant/action', {
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

  async function send(text: string) {
    const trimmed = text.trim();
    const imgs = attachments;
    if ((!trimmed && imgs.length === 0) || busy) return;

    const next: Msg[] = [...messages, { role: 'user', content: trimmed, attachments: imgs.length ? imgs : undefined }];
    setMessages([...next, { role: 'assistant', content: '', tools: [] }]);
    setInput('');
    setAttachments([]);
    setBusy(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: toApiMessages(next) }),
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
            let inp = a.input ?? {};
            if (a.name === 'import_contacts') {
              const parsed = imgs.flatMap((att) => att.contacts ?? []);
              if (parsed.length) inp = { ...inp, contacts: parsed };
            }
            patchLast((m) => ({ ...m, actions: [...(m.actions ?? []), { name: a.name, input: inp, status: 'pending' }] }));
          } else if (ev.t === 'error') patchLast((m) => ({ ...m, content: m.content + `\n\n[${String(ev.v)}]` }));
        }
      }
    } catch {
      patchLast((m) => ({ ...m, content: m.content || 'Couldn’t reach the assistant. Try again.' }));
    } finally {
      setBusy(false);
    }
  }

  async function addFiles(files: FileList | File[]) {
    const ok = Array.from(files).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || isTextLike(f));
    if (!ok.length) return;
    const atts = (await Promise.all(ok.map(fileToAttachment))).filter((a): a is Attachment => !!a);
    if (atts.length) setAttachments((prev) => [...prev, ...atts].slice(0, 6));
  }

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex h-[calc(100vh-11rem)] max-w-3xl flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink">{ASSISTANT_NAME}</span>
          {!empty && (
            <button onClick={newChat} disabled={busy} className="text-xs text-stone hover:text-ink disabled:opacity-40">
              New chat
            </button>
          )}
        </span>
        <span className="flex items-center gap-3">
          <Link href="/crm/assistant/reports" className="text-xs text-tulip hover:underline">Reports</Link>
          <Link href="/crm/assistant/team" className="text-xs text-tulip hover:underline">Team</Link>
          <Link href="/crm/assistant/memory" className="text-xs text-tulip hover:underline">Memory</Link>
          <Link href="/crm/assistant/drafts" className="text-xs text-tulip hover:underline">Drafts →</Link>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div>
              <h1 className="font-display text-3xl">{ASSISTANT_NAME}</h1>
              <p className="mt-2 max-w-md text-sm text-stone">
                Your PDS Logix operations assistant{userName ? `, ${userName.split(' ')[0]}` : ''}. Ask about jobs,
                clients, staff, assets, leads, or the books — it reads live from the CRM, and can draft, build reports,
                and take gated actions with your confirmation.
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
              <div key={i} className={m.role === 'user' ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-1 flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {m.attachments.map((att, k) =>
                      att.kind !== 'image' ? (
                        <span key={k} className="flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs text-ink">
                          {att.kind === 'text' ? '📊' : '📄'} <span className="max-w-[8rem] truncate">{att.name}</span>
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={k} src={att.url} alt="" className="h-24 w-24 rounded-xl border border-line object-cover" />
                      ),
                    )}
                  </div>
                )}
                {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                  <div className="mb-1 max-w-[85%] text-xs text-stone">
                    {busy && last && !m.content ? `${activity}…` : `Read: ${[...new Set(m.tools)].join(' · ')}`}
                  </div>
                )}
                <div
                  className={
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ' +
                    (m.role === 'user' ? 'bg-ink text-ivory' : 'border border-line bg-white text-ink') +
                    (m.role === 'user' && !m.content && m.attachments?.length ? ' hidden' : '')
                  }
                >
                  {m.content || (busy && last ? <span className="text-stone">Thinking…</span> : m.content)}
                </div>

                {m.actions?.map((a, ai) => (
                  <ActionCard
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

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {attachments.map((att, k) => (
            <div key={k} className="relative">
              {att.kind !== 'image' ? (
                <span className="flex h-16 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs text-ink">
                  {att.kind === 'text' ? '📊' : '📄'} <span className="max-w-[7rem] truncate">{att.name}</span>
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={att.url} alt="" className="h-16 w-16 rounded-lg border border-line object-cover" />
              )}
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== k))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-xs text-ivory"
                aria-label="Remove attachment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className={'flex items-end gap-2 pt-3' + (attachments.length > 0 ? '' : ' border-t border-line')}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.csv,.tsv,.txt,text/csv,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          title="Attach image, PDF, or CSV"
          className="rounded-full border border-line px-3 py-2.5 text-sm text-stone transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          📎
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.items ?? [])
              .filter((it) => it.kind === 'file')
              .map((it) => it.getAsFile())
              .filter((f): f is File => !!f)
              .filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf' || isTextLike(f));
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={`Ask ${ASSISTANT_NAME}… (paste or attach an image, PDF, or CSV)`}
          className="max-h-40 flex-1 resize-none rounded-2xl border border-line bg-white px-4 py-2.5 text-sm text-ink outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={busy || (!input.trim() && attachments.length === 0)}
          className="rounded-full bg-ink px-5 py-2.5 text-sm text-ivory transition-opacity disabled:opacity-40"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const ACTION_TITLES: Record<string, string> = {
  create_client: 'Create client',
  create_contact: 'Add contact',
  create_asset: 'Add asset',
  create_job: 'Create job',
  update_job: 'Update job',
  invoice_job: 'Invoice job in QuickBooks',
  create_invoice: 'Create invoice',
  create_bill: 'Create bill',
  update_invoice: 'Fix invoice',
  delete_invoices: 'Delete duplicate invoices',
  import_contacts: 'Import contacts',
};

// A confirmation card for a gated write Zordon proposed. Nothing runs until the
// human clicks Confirm — the app executes it, not the model.
function ActionCard({ action, onConfirm, onCancel }: { action: PendingAction; onConfirm: () => void; onCancel: () => void }) {
  const { name, input, status } = action;
  const title = ACTION_TITLES[name] ?? name;
  const amount = Number(input.amount);

  return (
    <div className="mt-2 max-w-[85%] rounded-2xl border border-tulip/40 bg-blush/40 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-tulip" />
        <span className="font-semibold text-ink">{title}</span>
        <span className="text-xs text-stone">· needs your confirmation</span>
      </div>

      {name === 'create_client' && (
        <div className="space-y-1 text-ink">
          <div>{String(input.name ?? '')}</div>
          <div className="text-stone">
            {[input.category, input.phone, input.billing_email].filter(Boolean).map(String).join(' · ') || '—'}
          </div>
        </div>
      )}
      {name === 'create_contact' && (
        <div className="text-ink">
          {String(input.name ?? '')} <span className="text-stone">at {String(input.client ?? '')}</span>
          {input.title ? <span className="text-stone"> · {String(input.title)}</span> : null}
          {input.email ? <span className="text-stone"> · {String(input.email)}</span> : null}
        </div>
      )}
      {name === 'create_asset' && (
        <div className="text-ink">
          {[input.year, input.make, input.model].filter(Boolean).map(String).join(' ') || 'Vehicle'}
          <span className="text-stone"> for {String(input.client ?? '')}</span>
          {input.vin ? <span className="text-stone"> · VIN {String(input.vin)}</span> : null}
        </div>
      )}
      {name === 'create_job' && (
        <div className="space-y-1 text-ink">
          <div>{String(input.service_type ?? '').replace('_', ' ')} <span className="text-stone">for {String(input.client ?? '')}</span></div>
          <div className="text-stone">
            {[input.status ?? 'requested', input.scheduled_date, Number.isFinite(amount) ? usd(Number(input.price)) : null]
              .filter(Boolean)
              .map(String)
              .join(' · ')}
          </div>
        </div>
      )}
      {name === 'update_job' && (
        <div className="text-ink">
          Job #{String(input.id ?? '?').slice(0, 8)}:{' '}
          {[
            input.status ? `status → ${String(input.status)}` : null,
            input.price != null ? `price → ${usd(Number(input.price))}` : null,
            input.cost != null ? `cost → ${usd(Number(input.cost))}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {name === 'invoice_job' && (
        <div className="space-y-1 text-ink">
          <div>Send job #{String(input.id ?? '?').slice(0, 8)} to QuickBooks</div>
          <p className="text-xs text-stone">Creates the invoice from the job’s client + price. Saved in QBO, not emailed.</p>
        </div>
      )}
      {(name === 'create_invoice' || name === 'create_bill') && (
        <div className="space-y-1 text-ink">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>
              <span className="text-stone">{name === 'create_invoice' ? 'Bill to:' : 'Pay:'}</span>{' '}
              {String(input.customer ?? input.vendor ?? '—')}
            </span>
            <span><span className="text-stone">Amount:</span> {Number.isFinite(amount) ? usd(amount) : '—'}</span>
            {input.due_date ? <span><span className="text-stone">Due:</span> {String(input.due_date)}</span> : null}
          </div>
          {input.description ? <p className="mt-1 text-stone">{String(input.description)}</p> : null}
          {name === 'create_invoice' ? <p className="mt-1 text-xs text-stone">Saved in QuickBooks — not emailed.</p> : null}
        </div>
      )}
      {name === 'update_invoice' && (
        <div className="space-y-1 text-ink">
          <div>
            <span className="text-stone">Fix invoice</span> #{String(input.invoice_number ?? '?')}:{' '}
            {[
              input.date ? `date → ${String(input.date)}` : null,
              input.due_date ? `due → ${String(input.due_date)}` : null,
              input.customer ? `customer → ${String(input.customer)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <p className="text-xs text-stone">The amount never changes. A paid invoice is left untouched.</p>
        </div>
      )}
      {name === 'delete_invoices' && (
        <div className="space-y-1 text-ink">
          {(() => {
            const rows = Array.isArray(input.invoices) ? (input.invoices as Record<string, unknown>[]) : [];
            return (
              <>
                <div className="font-medium text-tulip-dark">Delete {rows.length} invoice{rows.length === 1 ? '' : 's'} in QuickBooks — permanent</div>
                <div className="mt-1 max-h-40 overflow-auto text-xs text-stone">
                  {rows.slice(0, 12).map((r, i) => (
                    <div key={i}>
                      #{String(r.number ?? '—')}
                      {r.customer ? ` · ${String(r.customer)}` : ''}
                      {r.amount != null ? ` · ${usd(Number(r.amount) || 0)}` : ''}
                    </div>
                  ))}
                  {rows.length > 12 ? <div>…and {rows.length - 12} more</div> : null}
                </div>
                <p className="text-xs text-stone">Paid invoices are skipped automatically. This can’t be undone.</p>
              </>
            );
          })()}
        </div>
      )}
      {name === 'import_contacts' && (
        <div className="space-y-1 text-ink">
          {(() => {
            const rows = Array.isArray(input.contacts) ? (input.contacts as Record<string, unknown>[]) : [];
            const clients = new Set(rows.map((r) => String(r.company ?? '').trim().toLowerCase()).filter(Boolean));
            return (
              <>
                <div>
                  <span className="text-stone">Import:</span> {rows.length} contact{rows.length === 1 ? '' : 's'}
                  {clients.size ? ` · ${clients.size} client${clients.size === 1 ? '' : 's'}` : ''}
                </div>
                <div className="mt-1 max-h-40 overflow-auto text-xs text-stone">
                  {rows.slice(0, 8).map((r, i) => (
                    <div key={i}>
                      {String(r.name ?? '—')}{r.company ? ` · ${String(r.company)}` : ''}{r.email ? ` · ${String(r.email)}` : ''}
                    </div>
                  ))}
                  {rows.length > 8 ? <div>…and {rows.length - 8} more</div> : null}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <button onClick={onConfirm} className="rounded-full bg-ink px-4 py-1.5 text-xs text-ivory hover:bg-tulip">Confirm</button>
          <button onClick={onCancel} className="rounded-full border border-line px-4 py-1.5 text-xs text-stone hover:border-ink">Cancel</button>
        </div>
      )}
      {status === 'running' && <p className="mt-3 text-xs text-stone">Working…</p>}
      {status === 'done' && <p className="mt-3 text-xs font-medium text-[#5B8C5A]">✓ {action.result}</p>}
      {status === 'error' && <p className="mt-3 text-xs text-tulip-dark">{action.result}</p>}
    </div>
  );
}
