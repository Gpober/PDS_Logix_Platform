'use client';

import { useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { revalidateHome } from '@/lib/crm/actions';

// Generic uploader for a named homepage image (hero, mission, …). Uploads the
// file DIRECTLY from the browser to Supabase Storage under
// `site/<imageKey>-<uuid>.<ext>`, replacing any previous image for that key.
// The public homepage reads whatever is stored, so there's nothing else to save.
export function SiteImageUpload({
  imageKey,
  currentUrl,
  aspect = 'aspect-[21/9]',
  hint,
}: {
  imageKey: string;
  currentUrl?: string | null;
  aspect?: string;
  hint?: string;
}) {
  const [url, setUrl] = useState(currentUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createBrowserSupabase();

      // Replace only this key's previous image (leave other site images alone).
      const { data: existing } = await supabase.storage.from('talent-photos').list('site');
      const stale = (existing ?? []).filter((f) => f.name.startsWith(`${imageKey}-`));
      if (stale.length > 0) {
        await supabase.storage.from('talent-photos').remove(stale.map((f) => `site/${f.name}`));
      }

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `site/${imageKey}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('talent-photos')
        .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: true });

      if (upErr) {
        setError(
          upErr.message.includes('Bucket not found')
            ? 'Photo storage isn’t set up yet — create a public “talent-photos” bucket in Supabase.'
            : `Upload failed: ${upErr.message}`,
        );
        return;
      }

      const { data } = supabase.storage.from('talent-photos').getPublicUrl(path);
      setUrl(data.publicUrl);
      setSaved(true);
      revalidateHome().catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`group relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line bg-blush/30 text-center transition-colors hover:border-tulip disabled:opacity-70 ${aspect}`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-4 text-sm text-stone">
            {busy ? 'Uploading…' : 'Click to upload an image'}
          </span>
        )}
        {url && !busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-ink/0 text-sm text-ivory opacity-0 transition-opacity group-hover:bg-ink/50 group-hover:opacity-100">
            Replace image
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {hint && <p className="mt-3 text-xs text-stone">{hint}</p>}
      {busy && <p className="mt-2 text-sm text-tulip">Uploading… (large photos take a few seconds)</p>}
      {saved && !busy && <p className="mt-2 text-sm text-sage">Saved — it’s live on the homepage. 🌷</p>}
      {error && <p className="mt-2 text-sm text-tulip">{error}</p>}
    </div>
  );
}
