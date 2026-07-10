'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TulipMark } from '@/components/TulipMark';

const nav = [
  { href: '/#about', label: 'About' },
  { href: '/roster', label: 'Our Talent' },
  { href: '/#strategy', label: 'Our Strategy' },
];

export function SiteHeader() {
  // The authenticated CRM has its own header/nav — don't stack the marketing
  // header on top of it (especially cramped on mobile).
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname?.startsWith('/crm')) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-ivory/85 backdrop-blur">
      <div className="container-x flex h-16 items-center justify-between">
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 font-display text-xl tracking-tight"
        >
          <TulipMark className="h-6 w-6 text-tulip" />
          Tulips<span className="text-tulip">.</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 text-sm md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="link-underline text-ink/80 hover:text-ink">
              {item.label}
            </Link>
          ))}
          <Link
            href="/contact"
            className="rounded-full bg-ink px-5 py-2 text-ivory transition-colors hover:bg-tulip"
          >
            Get in Touch
          </Link>
          <Link href="/crm" className="link-underline text-ink/50 hover:text-ink">
            Log in
          </Link>
        </nav>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 flex-col items-center justify-center gap-[5px] md:hidden"
        >
          <span
            className={`h-px w-6 bg-ink transition-transform ${open ? 'translate-y-[6px] rotate-45' : ''}`}
          />
          <span className={`h-px w-6 bg-ink transition-opacity ${open ? 'opacity-0' : ''}`} />
          <span
            className={`h-px w-6 bg-ink transition-transform ${open ? '-translate-y-[6px] -rotate-45' : ''}`}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="border-t border-line bg-ivory px-5 py-4 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="block py-3 font-display text-2xl text-ink"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/contact"
            onClick={() => setOpen(false)}
            className="mt-3 block rounded-full bg-ink px-5 py-3 text-center text-ivory"
          >
            Get in Touch
          </Link>
          <Link
            href="/crm"
            onClick={() => setOpen(false)}
            className="mt-4 block text-center text-sm text-stone"
          >
            Log in
          </Link>
        </nav>
      )}
    </header>
  );
}
