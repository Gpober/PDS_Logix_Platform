'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Shared Cards/List switch. Persists the choice in the URL (?view=list) so the
// server component can pick the layout and the view stays shareable. Matches the
// toggle on the Companies list.
export function ViewToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'cards';

  function set(next: 'cards' | 'list') {
    const sp = new URLSearchParams(params.toString());
    if (next === 'cards') sp.delete('view');
    else sp.set('view', 'list');
    router.replace(sp.toString() ? `${pathname}?${sp.toString()}` : pathname);
  }

  return (
    <div className="flex overflow-hidden rounded-xl border border-line">
      <button
        onClick={() => set('cards')}
        className={`px-3 py-2 text-sm ${view === 'cards' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}
      >
        Cards
      </button>
      <button
        onClick={() => set('list')}
        className={`px-3 py-2 text-sm ${view === 'list' ? 'bg-ink text-ivory' : 'bg-white text-stone hover:bg-blush/50'}`}
      >
        List
      </button>
    </div>
  );
}
