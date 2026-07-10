'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TulipMark } from '@/components/TulipMark';

const quickLinks = [
  { href: '/', label: 'Home' },
  { href: '/#about', label: 'About Us' },
  { href: '/roster', label: 'Our Talent' },
  { href: '/#strategy', label: 'Our Strategy' },
  { href: '/contact', label: 'Contact Us' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: "T&C's" },
];

export function SiteFooter() {
  // Marketing footer is noise inside the CRM — hide it there.
  const pathname = usePathname();
  if (pathname?.startsWith('/crm')) return null;

  return (
    <footer className="mt-24 border-t border-line bg-ink text-ivory">
      <div className="container-x grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2 font-display text-3xl">
            <TulipMark className="h-8 w-8 text-tulip" />
            Tulips<span className="text-tulip">.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm text-ivory/70">
            A talent management agency helping creators blossom with intention — building
            editorial-grade partnerships across beauty, wellness, fashion and lifestyle.
          </p>
        </div>

        <div>
          <p className="eyebrow text-tulip">Quick Links</p>
          <ul className="mt-4 space-y-2 text-sm text-ivory/80">
            {quickLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="link-underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow text-tulip">Get in Touch</p>
          <ul className="mt-4 space-y-2 text-sm text-ivory/80">
            <li>
              <a href="mailto:collab@tulipstalent.co" className="link-underline">
                collab@tulipstalent.co
              </a>
            </li>
            <li>
              <Link href="/contact" className="link-underline">
                Apply to be represented
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-ivory/10">
        <div className="container-x flex flex-col items-start justify-between gap-2 py-6 text-xs text-ivory/50 sm:flex-row sm:items-center">
          <span>© 2026 Tulips Talent. All rights reserved.</span>
          <span>Blossom with intention. 🌷</span>
        </div>
      </div>
    </footer>
  );
}
