'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logVehicle } from '@/lib/crm/actions';
import { SERVICE_LABELS, SERVICE_TYPES } from '@/lib/crm/types';

// Downscale a camera photo to a sane size before upload (phones shoot 4–12 MB).
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
  const MAX = 1600;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.8));
}

const inputClass = 'w-full rounded-xl border border-line bg-ivory px-4 py-3 text-ink outline-none focus:border-tulip';

export function LogVehicleForm({ locations }: { locations: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);

  async function onPickPhoto(file: File | undefined) {
    if (!file) {
      setPhoto(null);
      setPreview(null);
      return;
    }
    setWorking(true);
    try {
      const blob = await compress(file);
      setPhoto(blob);
      setPreview(URL.createObjectURL(blob));
    } finally {
      setWorking(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const fd = new FormData(el);
    if (photo) fd.set('photo', photo, 'car.jpg');
    else fd.delete('photo');
    start(async () => {
      await logVehicle(fd);
      el.reset();
      setPhoto(null);
      setPreview(null);
      setDone(true);
      router.refresh();
      setTimeout(() => setDone(false), 2500);
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <label className="block">
        <span className="mb-1.5 block text-sm text-stone">Service</span>
        <select name="service_type" required defaultValue="" className={inputClass}>
          <option value="" disabled>Pick a service…</option>
          {SERVICE_TYPES.map((s) => (
            <option key={s} value={s}>{SERVICE_LABELS[s]}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm text-stone">Location</span>
        <input name="location" list="portal-locations" required placeholder="e.g. Manheim Dallas" className={inputClass} />
        <datalist id="portal-locations">
          {locations.map((l) => <option key={l} value={l} />)}
        </datalist>
      </label>

      {/* Photo of the car */}
      <div>
        <span className="mb-1.5 block text-sm text-stone">Photo of the car</span>
        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Car" className="h-48 w-full object-cover" />
            <button
              type="button"
              onClick={() => onPickPhoto(undefined)}
              className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white"
            >
              Retake
            </button>
          </div>
        ) : (
          <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-ivory text-stone">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span className="text-sm">{working ? 'Processing…' : 'Take / choose a photo'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPickPhoto(e.target.files?.[0])}
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Year</span>
          <input name="vehicle_year" type="number" inputMode="numeric" min="1900" max="2100" placeholder="2022" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">VIN (last 6)</span>
          <input name="vin_last6" maxLength={6} placeholder="123456" className={inputClass + ' uppercase'} />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm text-stone">Make / model (optional)</span>
        <input name="model_type" placeholder="e.g. Toyota Camry" className={inputClass} />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm text-stone">Note (optional)</span>
        <input name="note" placeholder="Anything worth flagging" className={inputClass} />
      </label>

      <button
        disabled={pending || working}
        className="w-full rounded-full bg-tulip px-4 py-3 text-sm font-medium text-ivory transition-colors hover:bg-tulip-dark disabled:opacity-50"
      >
        {pending ? 'Logging…' : done ? '✓ Logged!' : 'Log it'}
      </button>
    </form>
  );
}
