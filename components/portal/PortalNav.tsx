'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/portal', label: 'Home', icon: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { href: '/portal/log', label: 'Log', icon: 'M12 5v14M5 12h14' },
  { href: '/portal/performance', label: 'Stats', icon: 'M4 20V10M10 20V4M16 20v-8M22 20H2' },
  { href: '/portal/assistant', label: 'Zordon', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
  { href: '/portal/profile', label: 'Me', icon: 'M4 20a8 8 0 0 1 16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8' },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ivory/95 backdrop-blur md:static md:border-t-0">
      <div className="mx-auto flex max-w-lg md:max-w-none">
        {tabs.map((t) => {
          const active = t.href === '/portal' ? pathname === '/portal' : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href}
              className={'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors md:flex-row md:justify-center md:gap-2 md:py-2 md:text-sm ' + (active ? 'text-tulip' : 'text-stone hover:text-ink')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 md:h-4 md:w-4"><path d={t.icon} /></svg>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
