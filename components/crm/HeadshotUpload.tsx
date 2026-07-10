'use client';

import { useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';

// Headshot picker for the talent form. Uploads the image DIRECTLY from the
// browser to Supabase Storage (server actions cap request bodies at ~1MB and
// would stall on a large photo), then keeps the resulting public URL in a hidden
// `headshot_url` input so the existing saveTalent action needs no changes. A URL
// can still be pasted manually as a fallback.
export function HeadshotUpload({ defaultUrl }: { defaultUrl?: string | null }) {
  const [url, setUrl] = useState(defaultUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('talent-photos')
        .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm text-stone">Headshot</span>

      {/* saveTalent reads this */}
      <input type="hidden" name="headshot_url" value={url} />

      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="group relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-blush/30 text-center transition-colors hover:border-tulip disabled:opacity-70"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Headshot preview" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-xs text-stone">
              {busy ? 'Uploading…' : 'Click to upload'}
            </span>
          )}
          {url && !busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/0 text-xs text-ivory opacity-0 transition-opacity group-hover:bg-ink/50 group-hover:opacity-100">
              Replace
            </span>
          )}
        </button>

        <div className="flex-1 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <p className="text-xs text-stone">JPG or PNG. Portrait (3:4) looks best.</p>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="…or paste an image URL"
            className="w-full rounded-xl border border-line bg-white/60 px-3 py-2 text-sm text-ink outline-none focus:border-ink"
          />
          {busy && <p className="text-xs text-tulip">Uploading photo…</p>}
          {error && <p className="text-xs text-tulip">{error}</p>}
        </div>
      </div>
    </div>
  );
}
