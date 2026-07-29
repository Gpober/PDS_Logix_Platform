'use client';

import { useState, useTransition } from 'react';
import { uploadStaffHeadshot } from '@/lib/crm/actions';

// Downscale a headshot before upload (phones shoot big files).
async function compress(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const MAX = 800;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
}

// Immediate-upload headshot picker. On select it compresses, uploads to the
// staff-photos bucket, and writes the public URL into a hidden `headshot_url`
// field so the normal staff-form save persists it.
export function HeadshotUpload({ defaultUrl, name }: { defaultUrl?: string | null; name: string }) {
  const [url, setUrl] = useState<string | null>(defaultUrl ?? null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      const blob = await compress(file);
      const fd = new FormData();
      fd.set('file', blob, 'headshot.jpg');
      start(async () => {
        try {
          const next = await uploadStaffHeadshot(fd);
          setUrl(next);
        } catch (e) {
          setErr(e instanceof Error ? e.message : 'Upload failed.');
        }
      });
    } catch {
      setErr('Could not read that image.');
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input type="hidden" name="headshot_url" value={url ?? ''} />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-16 w-16 shrink-0 rounded-full border border-line object-cover" />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blush font-display text-xl text-tulip">
          {name?.charAt(0) || '?'}
        </span>
      )}
      <div className="text-sm">
        <label className="inline-block cursor-pointer rounded-full border border-line px-3 py-1.5 hover:border-ink">
          {pending ? 'Uploading…' : url ? 'Change photo' : 'Add photo'}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
        {url && (
          <button type="button" onClick={() => setUrl(null)} className="ml-3 text-xs text-stone hover:text-tulip-dark">
            Remove
          </button>
        )}
        {err && <p className="mt-1 text-xs text-tulip-dark">{err}</p>}
      </div>
    </div>
  );
}
