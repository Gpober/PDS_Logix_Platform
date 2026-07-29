'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Status { configured: boolean; connected: boolean; email: string | null }

export function CashSheetSync({ initialSheetUrl, syncedAt }: { initialSheetUrl: string | null; syncedAt: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(initialSheetUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/google/oauth/status').then((r) => r.json()).then(setStatus).catch(() => setStatus({ configured: false, connected: false, email: null }));
  }, []);

  async function post(path: string, key: string) {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fetch(path, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) { setMsg(d.error ?? 'Something went wrong.'); return null; }
      return d;
    } catch {
      setMsg('Couldn’t reach the server.');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function create() { const d = await post('/api/cashflow-sheet/create', 'create'); if (d?.url) { setSheetUrl(d.url); setMsg('Sheet created.'); } }
  async function push() { if (await post('/api/cashflow-sheet/push', 'push')) { setMsg('Pushed the forecast to the sheet.'); router.refresh(); } }
  async function pull() { const d = await post('/api/cashflow-sheet/pull', 'pull'); if (d) { setMsg(`Pulled ${d.imported ?? 0} adjustment${d.imported === 1 ? '' : 's'} from the sheet.`); router.refresh(); } }
  async function unlink() { if (await post('/api/cashflow-sheet/disconnect', 'unlink')) { setSheetUrl(null); setMsg('Sheet unlinked.'); } }
  async function disconnect() { if (await post('/api/google/oauth/disconnect', 'disc')) { setSheetUrl(null); setStatus((s) => (s ? { ...s, connected: false, email: null } : s)); } }

  const btn = 'rounded-full border border-line px-4 py-2 text-sm hover:border-ink disabled:opacity-50';

  if (!status) return <p className="text-sm text-stone">Checking Google…</p>;

  if (!status.configured) {
    return (
      <p className="rounded-xl border border-dashed border-line p-4 text-sm text-stone">
        Google Sheets sync isn’t switched on. Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> (and{' '}
        <code>SUPABASE_SERVICE_ROLE_KEY</code>) in the environment, and register the redirect URI{' '}
        <code>/api/google/oauth/callback</code> in Google Cloud.
      </p>
    );
  }

  if (!status.connected) {
    return (
      <div className="text-sm">
        <a href="/api/google/oauth/start" className="inline-block rounded-full bg-tulip px-4 py-2 text-ivory hover:bg-tulip-dark">Connect Google</a>
        <p className="mt-2 text-stone">Sign in with Google to create a live forecast sheet in your Drive.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {sheetUrl ? (
          <>
            <a href={sheetUrl} target="_blank" rel="noreferrer" className="rounded-full bg-tulip px-4 py-2 text-ivory hover:bg-tulip-dark">Open sheet ↗</a>
            <button onClick={push} disabled={!!busy} className={btn}>{busy === 'push' ? 'Pushing…' : 'Push → Sheet'}</button>
            <button onClick={pull} disabled={!!busy} className={btn}>{busy === 'pull' ? 'Pulling…' : 'Pull ← Sheet'}</button>
            <button onClick={unlink} disabled={!!busy} className="text-xs text-stone hover:text-tulip-dark">Unlink sheet</button>
          </>
        ) : (
          <button onClick={create} disabled={!!busy} className="rounded-full bg-tulip px-4 py-2 text-ivory hover:bg-tulip-dark disabled:opacity-50">
            {busy === 'create' ? 'Creating…' : 'Create forecast sheet'}
          </button>
        )}
      </div>
      <p className="text-xs text-stone">
        Connected as {status.email ?? 'Google'}
        {syncedAt ? ` · last synced ${new Date(syncedAt).toLocaleString('en-US')}` : ''}
        {' · '}
        <button onClick={disconnect} className="text-stone underline hover:text-tulip-dark">disconnect Google</button>
      </p>
      <p className="text-xs text-stone">Edit the <span className="text-ink">ADJUSTMENTS</span> block in the sheet, then <span className="text-ink">Pull ← Sheet</span> to bring them back. <span className="text-ink">Push → Sheet</span> rewrites the sheet from the latest numbers.</p>
      {msg && <p className="text-xs text-tulip-dark">{msg}</p>}
    </div>
  );
}
