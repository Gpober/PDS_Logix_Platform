'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/crm', label: 'Home' },
  { href: '/crm/clients', label: 'Clients' },
  { href: '/crm/contacts', label: 'Contacts' },
  { href: '/crm/assets', label: 'Vehicles' },
  { href: '/crm/jobs', label: 'Jobs' },
  { href: '/crm/reports', label: 'Reports' },
  { href: '/crm/staff', label: 'Staff' },
  { href: '/crm/leads', label: 'Leads' },
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
              (active ? 'bg-ink text-white' : 'text-stone hover:bg-mist')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
