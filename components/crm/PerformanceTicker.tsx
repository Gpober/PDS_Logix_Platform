'use client';

import { useEffect, useState } from 'react';

interface TickerItem {
  label: string;
  value: string;
  tone: 'up' | 'warn' | 'info';
}

const TONE: Record<TickerItem['tone'], { text: string; glow: string }> = {
  up: { text: '#7DE0B0', glow: 'rgba(125,224,176,0.55)' },
  warn: { text: '#F5A97F', glow: 'rgba(245,169,127,0.5)' },
  info: { text: '#7FD4EC', glow: 'rgba(127,212,236,0.5)' },
};

// A futuristic, ESPN-style crawl of agency performance + live market quotes.
// Polls its own endpoint so it stays live and never blocks page render.
export function PerformanceTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/crm/ticker', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { items: TickerItem[] };
        if (alive) setItems(data.items ?? []);
      } catch {
        /* leave last-known items */
      }
    };
    load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (items.length === 0) return null;

  // Duplicate the run so the marquee loops seamlessly.
  const run = [...items, ...items];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="pointer-events-auto relative overflow-hidden border-t border-white/10 bg-[#0B0E14] py-2 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
        {/* scanline + edge fades */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 3px)' }}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#0B0E14] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#0B0E14] to-transparent" />

        {/* LIVE badge */}
        <div className="absolute inset-y-0 left-0 z-20 flex items-center gap-1.5 bg-[#0B0E14] pl-3 pr-4">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#7DE0B0] shadow-[0_0_8px_2px_rgba(125,224,176,0.7)]" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">Live</span>
        </div>

        <div className="ticker-track flex w-max items-center whitespace-nowrap pl-24">
          {run.map((it, i) => {
            const tone = TONE[it.tone];
            return (
              <span key={i} className="mx-5 inline-flex items-center gap-2 text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-white/65">{it.label}</span>
                <span className="font-mono font-semibold" style={{ color: tone.text, textShadow: `0 0 10px ${tone.glow}` }}>
                  {it.value}
                </span>
                <span className="text-white/15">•</span>
              </span>
            );
          })}
        </div>
      </div>

      <style>{`
        .ticker-track { animation: crm-ticker 60s linear infinite; }
        .ticker-track:hover { animation-play-state: paused; }
        @keyframes crm-ticker {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track { animation-duration: 240s; }
        }
      `}</style>
    </div>
  );
}
