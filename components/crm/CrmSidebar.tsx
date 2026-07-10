'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CrmNav } from './CrmNav';

// CRM sidebar: a static left column on desktop, and a hamburger-triggered drawer
// on mobile. Account actions (role, sign out) tuck into the dropdown on mobile.
export function CrmSidebar({ menuExtras }: { menuExtras?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const logo = (
    <Link
      href="/crm"
      onClick={() => setOpen(false)}
      className="flex items-center gap-2 px-2 font-display text-xl"
    >
      PDS Logix<span className="text-tulip">.</span>{' '}
      <span className="font-sans text-sm text-stone">CRM</span>
    </Link>
  );

  return (
    <>
      {/* Mobile top bar with hamburger + drop-down menu */}
      <div className="relative z-50 md:hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line bg-ivory px-4 py-3">
          {logo}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="rounded-lg p-1.5 text-ink hover:bg-blush/60"
          >
            {open ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-3 top-full z-50 mt-1 w-56 rounded-2xl border border-line bg-ivory p-2 shadow-lg">
              <CrmNav onNavigate={() => setOpen(false)} />
              {menuExtras && (
                <>
                  <div className="my-2 border-t border-line" />
                  <div className="px-2" onClick={() => setOpen(false)}>
                    {menuExtras}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden bg-ivory md:block md:w-60 md:shrink-0 md:border-r md:border-line">
        <div className="sticky top-0 flex h-screen flex-col gap-4 p-4">
          {logo}
          <CrmNav />
        </div>
      </aside>
    </>
  );
}
