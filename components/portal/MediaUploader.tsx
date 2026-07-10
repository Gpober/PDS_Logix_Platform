'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

// Uploads a photo/video straight to Supabase Storage and records it in the
// creator's media library (content_media). RLS confines rows to the creator.
export function MediaUploader({ talentId }: { talentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `content/${talentId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('talent-photos')
        .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const { data } = supabase.storage.from('talent-photos').getPublicUrl(path);
      const { error: insErr } = await supabase
        .from('content_media')
        .insert({ talent_id: talentId, url: data.publicUrl, kind });
      if (insErr) {
        setError(`Saved the file but couldn’t add it to your library: ${insErr.message}`);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
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
        className="rounded-full bg-ink px-5 py-2.5 text-sm text-ivory transition-colors hover:bg-tulip disabled:opacity-60"
      >
        {busy ? 'Uploading…' : '+ Upload photo / video'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <p className="mt-2 text-sm text-tulip">{error}</p>}
    </div>
  );
}
