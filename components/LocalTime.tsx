'use client';

import { useEffect, useState } from 'react';

// Renders a UTC ISO instant in the viewer's own timezone. It starts empty on the
// server + first client render (so hydration matches), then fills in after mount.
export function LocalTime({ iso, dateOnly = false }: { iso: string | null; dateOnly?: boolean }) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    setText(
      d.toLocaleString(
        undefined,
        dateOnly
          ? { month: 'short', day: 'numeric', year: 'numeric' }
          : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
      ),
    );
  }, [iso, dateOnly]);

  if (!iso) return <span>—</span>;
  return <span suppressHydrationWarning>{text || '…'}</span>;
}
