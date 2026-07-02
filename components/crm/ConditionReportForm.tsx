'use client';

import { useState } from 'react';
import Link from 'next/link';
import { saveConditionReport } from '@/lib/crm/actions';
import { GRADES, SEVERITIES, type ConditionReport, type Finding, type Photo } from '@/lib/crm/types';

const field =
  'w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink';

export function ConditionReportForm({
  jobId,
  assetId,
  staff,
  report,
  cancelHref,
}: {
  jobId: string;
  assetId: string | null;
  staff: { id: string; name: string }[];
  report: ConditionReport | null;
  cancelHref: string;
}) {
  const [findings, setFindings] = useState<Finding[]>(report?.findings ?? []);
  const [photos, setPhotos] = useState<Photo[]>(report?.photos ?? []);

  const totalEstimate = findings.reduce((s, f) => s + (Number(f.cost_estimate) || 0), 0);

  function updateFinding(i: number, patch: Partial<Finding>) {
    setFindings((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function updatePhoto(i: number, patch: Partial<Photo>) {
    setPhotos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  return (
    <form action={saveConditionReport} className="space-y-6">
      <input type="hidden" name="job_id" value={jobId} />
      {assetId && <input type="hidden" name="asset_id" value={assetId} />}
      <input type="hidden" name="findings_json" value={JSON.stringify(findings)} />
      <input type="hidden" name="photos_json" value={JSON.stringify(photos)} />

      {/* Summary */}
      <div className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Overall grade</span>
          <select name="overall_grade" defaultValue={report?.overall_grade ?? ''} className={field}>
            <option value="">—</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g[0].toUpperCase() + g.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Mileage</span>
          <input name="mileage" type="number" defaultValue={report?.mileage ?? ''} className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Inspected by</span>
          <select name="inspected_by" defaultValue={report?.inspected_by ?? ''} className={field}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-3">
          <span className="mb-1.5 block text-sm text-stone">Inspected at</span>
          <input
            name="inspected_at"
            type="datetime-local"
            defaultValue={report?.inspected_at ? report.inspected_at.slice(0, 16) : ''}
            className={field + ' sm:max-w-xs'}
          />
        </label>
      </div>

      {/* Findings */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg">Damage findings</h2>
          <span className="text-sm text-stone">
            Est. total: <span className="font-medium text-ink">${totalEstimate.toLocaleString()}</span>
          </span>
        </div>
        {findings.length === 0 && (
          <p className="mb-3 text-sm text-stone">No findings yet — a clean report is fine too.</p>
        )}
        <div className="space-y-3">
          {findings.map((f, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_2fr_auto_auto]">
              <input
                placeholder="Area (e.g. Front bumper)"
                value={f.area}
                onChange={(e) => updateFinding(i, { area: e.target.value })}
                className={field}
              />
              <select
                value={f.severity}
                onChange={(e) => updateFinding(i, { severity: e.target.value })}
                className={field}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              <input
                placeholder="Description"
                value={f.description}
                onChange={(e) => updateFinding(i, { description: e.target.value })}
                className={field}
              />
              <input
                placeholder="$ est."
                type="number"
                value={f.cost_estimate ?? ''}
                onChange={(e) =>
                  updateFinding(i, { cost_estimate: e.target.value === '' ? null : Number(e.target.value) })
                }
                className={field + ' w-24'}
              />
              <button
                type="button"
                onClick={() => setFindings((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded-xl border border-line px-3 text-sm text-stone hover:border-ink"
                aria-label="Remove finding"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setFindings((prev) => [...prev, { area: '', severity: 'minor', description: '', cost_estimate: null }])
          }
          className="mt-3 rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
        >
          + Add finding
        </button>
      </div>

      {/* Photos */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 font-display text-lg">Photos</h2>
        <div className="space-y-3">
          {photos.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[2fr_1fr_auto]">
              <input
                placeholder="Photo URL (https://…)"
                value={p.url}
                onChange={(e) => updatePhoto(i, { url: e.target.value })}
                className={field}
              />
              <input
                placeholder="Label"
                value={p.label}
                onChange={(e) => updatePhoto(i, { label: e.target.value })}
                className={field}
              />
              <button
                type="button"
                onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                className="rounded-xl border border-line px-3 text-sm text-stone hover:border-ink"
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPhotos((prev) => [...prev, { url: '', label: '' }])}
          className="mt-3 rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
        >
          + Add photo
        </button>
      </div>

      {/* Notes */}
      <div className="grid gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Exterior notes</span>
          <textarea name="exterior_notes" rows={4} defaultValue={report?.exterior_notes ?? ''} className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Interior notes</span>
          <textarea name="interior_notes" rows={4} defaultValue={report?.interior_notes ?? ''} className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Mechanical notes</span>
          <textarea name="mechanical_notes" rows={4} defaultValue={report?.mechanical_notes ?? ''} className={field} />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button className="rounded-full bg-ink px-6 py-2.5 text-sm text-white transition-colors hover:bg-steel">
          Save report
        </button>
        <Link href={cancelHref} className="text-sm text-stone hover:text-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
