'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signOut } from '@/lib/crm/actions';

// Hamburger dropdown for the creator portal header — keeps the top bar clean by
// tucking navigation + sign-out behind one button.
export function PortalNav({ publicSlug }: { publicSlug?: string | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const linkCls = 'block rounded-lg px-3 py-2 text-sm text-ink transition-colors hover:bg-blush/60';

  return (
    <div className="relative">
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

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-2xl border border-line bg-ivory p-2 shadow-lg">
            <Link href="/portal" onClick={close} className={linkCls}>
              Dashboard
            </Link>
            <Link href="/portal/content" onClick={close} className={linkCls}>
              Content planner
            </Link>
            <Link href="/portal/analytics" onClick={close} className={linkCls}>
              Performance
            </Link>
            <Link href="/portal/profile" onClick={close} className={linkCls}>
              Edit profile
            </Link>
            {publicSlug && (
              <Link
                href={`/talent/${publicSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className={linkCls}
              >
                View public profile ↗
              </Link>
            )}
            <div className="my-1 border-t border-line" />
            <form action={signOut}>
              <button className={`${linkCls} w-full text-left text-stone hover:text-ink`}>
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
