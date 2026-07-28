'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Upload a Connecteam production export (xlsx). Posts the file to the server,
// which parses and loads every unit — no size limit, so a whole month's export
// (thousands of rows) loads in one go. Idempotent: re-uploading only adds new.
export function ProductionImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    setResult(null);
    let ok = 0;
    const msgs: string[] = [];
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append('file', file);
      try {
        const res = await fetch('/api/production/import', { method: 'POST', body });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) { ok++; msgs.push(`${file.name}: ${data.message}`); }
        else msgs.push(`${file.name}: ${data.error ?? 'Failed.'}`);
      } catch {
        msgs.push(`${file.name}: Couldn’t reach the server.`);
      }
    }
    setResult({ ok: ok > 0, message: msgs.join('\n') });
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (ok > 0) router.refresh();
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <h3 className="font-display text-lg">Import a production export</h3>
      <p className="mt-1 text-sm text-stone">
        Upload a Connecteam entries export (.xlsx) — one file per location/month. Every unit loads with who, when,
        VIN, model, and service type. 2026 only; re-uploading the same file is safe (only new units are added).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          disabled={busy}
          onChange={(e) => upload(e.target.files)}
          className="block text-sm text-stone file:mr-3 file:rounded-full file:border-0 file:bg-tulip file:px-4 file:py-2 file:text-xs file:text-ivory hover:file:bg-tulip-dark"
        />
        {busy && <span className="text-xs text-stone">Uploading &amp; loading… (large files take a moment)</span>}
      </div>
      {result && (
        <pre className={'mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-blush/40 p-3 text-xs ' + (result.ok ? 'text-ink' : 'text-tulip-dark')}>
          {result.message}
        </pre>
      )}
    </div>
  );
}
