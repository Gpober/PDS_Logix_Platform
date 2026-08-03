'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Car-count reconciliation workbench: upload the auction's unit list (csv/xlsx),
// match it against our production log VIN by VIN, and work the exceptions —
// units they billed that we never logged, and units we did that never made
// their list. Every number here comes from /api/recon/*, the same functions
// Zordon reads, so the chat and the screen always agree.

interface Batch {
  id: string;
  label: string;
  counterparty: string;
  location: string | null;
  period_start: string | null;
  period_end: string | null;
  ours_file: string | null;
  theirs_file: string | null;
  ours_rows: number;
  theirs_rows: number;
  created_at: string;
}

interface Summary {
  ours_source: 'uploaded_file' | 'production_log';
  ours_units: number;
  theirs_units: number;
  variance: number;
  matched_units: number;
  only_ours: number;
  only_theirs: number;
  no_vin_ours: number;
  no_vin_theirs: number;
  match_rate: number;
  their_amount_total: number;
  amount_only_theirs: number;
  amount_only_ours: number;
  date_from: string | null;
  date_to: string | null;
  by_day: { day: string; ours: number; theirs: number; variance: number }[];
  by_location: { location: string; ours: number; theirs: number; variance: number }[];
  by_service: { service_type: string; ours: number; theirs: number; variance: number }[];
}

type Status = 'only_theirs' | 'only_ours' | 'no_vin' | 'matched';

interface Row {
  side: 'ours' | 'theirs';
  vin6: string | null;
  vin: string | null;
  serviced_on: string | null;
  location: string | null;
  service_type: string | null;
  vehicle_desc: string | null;
  external_ref: string | null;
  amount: number | null;
  staff_name: string | null;
  status: Status;
}

const nf = (n: number) => n.toLocaleString('en-US');
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const TONE = { ink: '#F2F5F8', cyan: '#16B4E8', good: '#4ADE80', warn: '#FBBF24', bad: '#F87171' };

function Kpi({ label, value, tone = TONE.ink, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="group relative flex flex-col items-center overflow-hidden rounded-[20px] border border-line bg-gradient-to-b from-white to-blush/50 px-5 py-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.3),0_12px_30px_rgba(22,180,232,0.06)] transition duration-300 hover:-translate-y-0.5">
      <span className="pointer-events-none absolute -top-10 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-30" style={{ background: tone }} />
      <div className="relative text-[10px] font-semibold uppercase tracking-[0.18em] text-stone">{label}</div>
      <div className="relative mt-3 font-display text-[2rem] leading-none tabular-nums" style={{ color: tone }}>{value}</div>
      <span className="relative mt-3 h-[3px] w-7 rounded-full" style={{ background: tone, opacity: 0.6 }} />
      {sub != null && <div className="relative mt-2.5 text-xs text-stone">{sub}</div>}
    </div>
  );
}

// ---- Upload ----------------------------------------------------------------

function UploadCard({ locations, batches, onDone }: { locations: string[]; batches: Batch[]; onDone: (batchId: string) => void }) {
  const [side, setSide] = useState<'theirs' | 'ours'>('theirs');
  const [target, setTarget] = useState<string>('');       // '' = start a new reconciliation
  const [counterparty, setCounterparty] = useState('Manheim');
  const [location, setLocation] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function upload(files: FileList | null, input: HTMLInputElement) {
    if (!files?.length) return;
    setBusy(true);
    setResult(null);
    const body = new FormData();
    body.append('file', files[0]);
    body.append('side', side);
    if (target) body.append('batch_id', target);
    if (counterparty.trim()) body.append('counterparty', counterparty.trim());
    if (location) body.append('location', location);
    if (from) body.append('period_start', from);
    if (to) body.append('period_end', to);
    try {
      const res = await fetch('/api/recon/import', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setResult({ ok: true, message: data.message });
        onDone(data.batch_id);
        setTarget(data.batch_id);
      } else {
        setResult({ ok: false, message: data.error ?? 'Upload failed.' });
      }
    } catch {
      setResult({ ok: false, message: 'Couldn’t reach the server.' });
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="eyebrow">Upload</p>
      <h3 className="mt-1 font-display text-lg">Load a car count</h3>
      <p className="mt-1 text-sm text-stone">
        Drop in the auction’s unit list (.csv / .xlsx) — VIN, date, work order, and charge are picked up automatically.
        Our side comes from the production log by default; upload our own count file only if it isn’t logged there.
        Re-uploading a side replaces it.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-stone">Whose file is this?</span>
          <select value={side} onChange={(e) => setSide(e.target.value as 'theirs' | 'ours')} className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip">
            <option value="theirs">Theirs — the auction’s list</option>
            <option value="ours">Ours — our own count</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-stone">Add to</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip">
            <option value="">New reconciliation</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
      </div>

      {!target && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stone">Counterparty</span>
            <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Manheim" className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stone">Our location</span>
            <select value={location} onChange={(e) => setLocation(e.target.value)} className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip">
              <option value="">All locations</option>
              {locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stone">From (optional)</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-stone">To (optional)</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-xl border border-line bg-ivory px-3 py-2 text-sm text-ink outline-none focus:border-tulip" />
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,.xlsx,.xls,.tsv"
          disabled={busy}
          onChange={(e) => upload(e.target.files, e.target)}
          className="block text-sm text-stone file:mr-3 file:rounded-full file:border-0 file:bg-tulip file:px-4 file:py-2 file:text-xs file:text-ivory hover:file:bg-tulip-dark"
        />
        {busy && <span className="text-xs text-stone">Loading &amp; matching…</span>}
      </div>
      {result && (
        <p className={'mt-3 rounded-xl border border-line bg-blush/40 p-3 text-xs ' + (result.ok ? 'text-ink' : 'text-tulip-dark')}>{result.message}</p>
      )}
      <p className="mt-3 text-xs text-stone">
        Scope matters: pick the location and dates so our side covers the same units their file does — otherwise the
        variance is just a window mismatch.
      </p>
    </div>
  );
}

// ---- Variance by day -------------------------------------------------------

function DayVariance({ rows }: { rows: Summary['by_day'] }) {
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.ours, r.theirs)));
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="eyebrow">Trend</p>
      <h3 className="mt-1 mb-3 font-display text-lg">Ours vs theirs, by day</h3>
      <div className="-mx-2 flex h-44 items-end gap-1 overflow-x-auto px-2">
        {rows.map((r) => (
          <div key={r.day} className="flex min-w-[26px] flex-1 flex-col items-center gap-1" title={`${r.day}: ours ${nf(r.ours)} · theirs ${nf(r.theirs)} · variance ${r.variance > 0 ? '+' : ''}${nf(r.variance)}`}>
            <span className={'text-[10px] tabular-nums ' + (r.variance === 0 ? 'text-stone' : 'text-tulip')}>
              {r.variance === 0 ? '0' : `${r.variance > 0 ? '+' : ''}${nf(r.variance)}`}
            </span>
            <div className="flex h-32 w-full items-end justify-center gap-[2px]">
              <div className="w-1/2 rounded-t" style={{ height: `${(r.ours / max) * 100}%`, background: TONE.cyan }} />
              <div className="w-1/2 rounded-t" style={{ height: `${(r.theirs / max) * 100}%`, background: TONE.warn }} />
            </div>
            <span className="text-[10px] text-stone">{r.day.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-xs text-stone">
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: TONE.cyan }} /> Ours</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: TONE.warn }} /> Theirs</span>
      </div>
    </div>
  );
}

type SplitRow = { ours: number; theirs: number; variance: number; location?: string; service_type?: string };

function SplitTable({ title, rows, keyName }: { title: string; rows: SplitRow[]; keyName: 'location' | 'service_type' }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <p className="eyebrow">Breakdown</p>
      <h3 className="mt-1 mb-3 font-display text-lg">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wider text-stone">
            <th className="px-2 py-2 text-left font-medium">{keyName === 'location' ? 'Location' : 'Service'}</th>
            <th className="px-2 py-2 text-right font-medium">Ours</th>
            <th className="px-2 py-2 text-right font-medium">Theirs</th>
            <th className="px-2 py-2 text-right font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((r, i) => {
            const key = r[keyName] ?? '—';
            return (
              <tr key={i} className="border-b border-line/60">
                <td className="max-w-[220px] truncate px-2 py-2 text-ink">{key}</td>
                <td className="px-2 py-2 text-right tabular-nums text-stone">{nf(r.ours)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-stone">{nf(r.theirs)}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums" style={{ color: r.variance === 0 ? TONE.good : TONE.bad }}>
                  {r.variance > 0 ? '+' : ''}{nf(r.variance)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Workbench -------------------------------------------------------------

export function ReconWorkbench({ initialBatches, locations }: { initialBatches: Batch[]; locations: string[] }) {
  const [batches, setBatches] = useState<Batch[]>(initialBatches);
  const [batchId, setBatchId] = useState<string>(initialBatches[0]?.id ?? '');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status>('only_theirs');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rowCount, setRowCount] = useState(0);

  const batch = useMemo(() => batches.find((b) => b.id === batchId) ?? null, [batches, batchId]);

  const refreshBatches = useCallback(async (selectId?: string) => {
    const res = await fetch('/api/recon/batches');
    const data = await res.json().catch(() => ({}));
    const list: Batch[] = data.batches ?? [];
    setBatches(list);
    if (selectId) setBatchId(selectId);
    else if (!list.some((b) => b.id === batchId)) setBatchId(list[0]?.id ?? '');
  }, [batchId]);

  const loadSummary = useCallback(async () => {
    if (!batchId) { setSummary(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/recon/summary?batch=${batchId}`);
      const data = await res.json().catch(() => ({}));
      setSummary(data.summary ?? null);
    } finally { setLoading(false); }
  }, [batchId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const loadRows = useCallback(async () => {
    if (!batchId) { setRows(null); return; }
    const res = await fetch(`/api/recon/exceptions?batch=${batchId}&status=${status}&limit=200`);
    const data = await res.json().catch(() => ({}));
    setRows(data.rows ?? []);
    setRowCount(data.count ?? 0);
  }, [batchId, status]);

  useEffect(() => { loadRows(); }, [loadRows]);

  async function removeBatch() {
    if (!batch) return;
    if (!confirm(`Delete “${batch.label}” and its uploaded units? Our production log isn’t touched.`)) return;
    await fetch(`/api/recon/batches?id=${batch.id}`, { method: 'DELETE' });
    await refreshBatches();
  }

  const tabs: { v: Status; label: string; count: number }[] = summary
    ? [
        { v: 'only_theirs', label: 'On their list, not ours', count: summary.only_theirs },
        { v: 'only_ours', label: 'On ours, not theirs', count: summary.only_ours },
        { v: 'no_vin', label: 'No VIN', count: summary.no_vin_ours + summary.no_vin_theirs },
        { v: 'matched', label: 'Matched', count: summary.matched_units },
      ]
    : [];

  const varianceTone = summary ? (summary.variance === 0 ? TONE.good : Math.abs(summary.variance) / Math.max(1, summary.theirs_units) > 0.02 ? TONE.bad : TONE.warn) : TONE.ink;

  return (
    <div className="space-y-6">
      {batches.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="max-w-full rounded-full border border-line bg-white px-4 py-1.5 text-sm text-ink outline-none focus:border-tulip">
            {batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          {batch && (
            <span className="text-xs text-stone">
              {batch.counterparty} · {batch.theirs_file ?? 'no file'} · {nf(batch.theirs_rows)} of their units
              {batch.ours_rows ? ` · ${nf(batch.ours_rows)} of ours (file)` : ''}
            </span>
          )}
          {batch && <button onClick={removeBatch} className="rounded-full border border-line px-3 py-1 text-xs text-stone hover:border-tulip hover:text-tulip">Delete</button>}
          {loading && <span className="text-xs text-stone">Reconciling…</span>}
        </div>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Our count" value={nf(summary.ours_units)} tone={TONE.cyan} sub={summary.ours_source === 'production_log' ? 'from the production log' : 'from our uploaded file'} />
            <Kpi label={`${batch?.counterparty ?? 'Their'} count`} value={nf(summary.theirs_units)} tone={TONE.warn} sub={summary.date_from ? `${summary.date_from} → ${summary.date_to}` : undefined} />
            <Kpi label="Variance" value={`${summary.variance > 0 ? '+' : ''}${nf(summary.variance)}`} tone={varianceTone} sub={summary.variance === 0 ? 'counts agree' : summary.variance > 0 ? 'we logged more' : 'they listed more'} />
            <Kpi label="Matched" value={`${summary.match_rate}%`} tone={summary.match_rate >= 98 ? TONE.good : TONE.warn} sub={`${nf(summary.matched_units)} units matched by VIN`} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label="They billed, we didn’t log" value={nf(summary.only_theirs)} tone={summary.only_theirs ? TONE.bad : TONE.good} sub={summary.amount_only_theirs ? `${money(summary.amount_only_theirs)} on their side` : 'no gap'} />
            <Kpi label="We logged, they didn’t list" value={nf(summary.only_ours)} tone={summary.only_ours ? TONE.bad : TONE.good} sub={summary.only_ours ? 'chase these for payment' : 'no gap'} />
            <Kpi label="Their charges" value={money(summary.their_amount_total)} tone={TONE.ink} sub={summary.their_amount_total ? 'total on their file' : 'no amounts in their file'} />
          </div>

          <DayVariance rows={summary.by_day} />

          <div className="grid gap-4 lg:grid-cols-2">
            <SplitTable title="By location" rows={summary.by_location} keyName="location" />
            <SplitTable title="By service type" rows={summary.by_service} keyName="service_type" />
          </div>

          {/* Exceptions */}
          <div className="rounded-2xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Exceptions</p>
                <h3 className="mt-1 font-display text-lg">The units behind the variance{rowCount ? ` · ${nf(rowCount)}` : ''}</h3>
              </div>
              <a href={`/api/recon/exceptions?batch=${batchId}&status=${status}&format=csv`} className="rounded-full border border-line px-3 py-1 text-xs text-stone hover:border-tulip hover:text-tulip">
                Download CSV
              </a>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {tabs.map((t) => (
                <button key={t.v} onClick={() => setStatus(t.v)}
                  className={'rounded-full px-3 py-1 text-xs transition-colors ' + (status === t.v ? 'bg-tulip text-ivory' : 'border border-line text-stone hover:text-ink')}>
                  {t.label} · {nf(t.count)}
                </button>
              ))}
            </div>

            {rows == null ? (
              <p className="mt-3 text-sm text-stone">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="mt-3 text-sm text-stone">Nothing in this bucket — the two counts agree here.</p>
            ) : (
              <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 border-b border-line bg-white text-xs uppercase tracking-wider text-stone">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Side</th>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">VIN</th>
                      <th className="px-3 py-2 text-left font-medium">Vehicle</th>
                      <th className="px-3 py-2 text-left font-medium">Service</th>
                      <th className="px-3 py-2 text-left font-medium">Ref</th>
                      <th className="px-3 py-2 text-left font-medium">Who</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-line hover:bg-blush/30">
                        <td className="px-3 py-2">
                          <span className={'rounded-full px-2 py-0.5 text-[11px] ' + (r.side === 'ours' ? 'bg-blush text-tulip' : 'bg-line/40 text-stone')}>
                            {r.side === 'ours' ? 'Ours' : batch?.counterparty ?? 'Theirs'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-stone">{r.serviced_on ?? '—'}</td>
                        <td className="px-3 py-2 tabular-nums text-ink">{r.vin6 ?? '—'}</td>
                        <td className="px-3 py-2 text-stone">{r.vehicle_desc ?? '—'}</td>
                        <td className="px-3 py-2 text-stone">{r.service_type ?? '—'}</td>
                        <td className="px-3 py-2 text-stone">{r.external_ref ?? '—'}</td>
                        <td className="px-3 py-2 text-stone">{r.staff_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-stone">{r.amount == null ? '—' : money(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rowCount > rows.length && <p className="border-t border-line p-2 text-center text-xs text-stone">Showing {rows.length} of {nf(rowCount)} — download the CSV for the full list.</p>}
              </div>
            )}
          </div>
        </>
      )}

      <UploadCard locations={locations} batches={batches} onDone={(id) => refreshBatches(id)} />
    </div>
  );
}
