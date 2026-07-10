'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/crm', label: 'Home' },
  { href: '/crm/assistant', label: 'Assistant' },
  { href: '/crm/companies', label: 'Companies' },
  { href: '/crm/talent', label: 'Talent' },
  { href: '/crm/content', label: 'Content' },
  { href: '/crm/deals', label: 'Deals' },
  { href: '/crm/performance', label: 'Performance' },
  { href: '/crm/analytics', label: 'Analytics' },
  { href: '/crm/financials', label: 'Financials' },
  { href: '/crm/leads', label: 'Leads' },
  { href: '/crm/tasks', label: 'Tasks' },
  { href: '/crm/settings', label: 'Settings' },
];

export function CrmNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {tabs.map((t) => {
        const active = t.href === '/crm' ? pathname === '/crm' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            onClick={onNavigate}
            className={
              'w-full rounded-full px-4 py-2 text-sm transition-colors ' +
              (active ? 'bg-ink text-ivory' : 'text-stone hover:bg-blush/60')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
