'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Quick-access links, always visible.
const standalone = [
  { href: '/crm', label: 'Home' },
  { href: '/crm/assistant', label: 'Zordon' },
];

// Everything else lives in collapsible sections so the sidebar reads tidy.
const groups = [
  { key: 'clients', label: 'Clients', items: [
    { href: '/crm/clients', label: 'Clients' },
    { href: '/crm/contacts', label: 'Contacts' },
    { href: '/crm/leads', label: 'Leads' },
  ] },
  { key: 'ops', label: 'Operations', items: [
    { href: '/crm/jobs', label: 'Jobs' },
    { href: '/crm/assets', label: 'Assets' },
    { href: '/crm/production', label: 'Production' },
  ] },
  { key: 'people', label: 'People & Pay', items: [
    { href: '/crm/staff', label: 'Team' },
    { href: '/crm/time', label: 'Time Clock' },
    { href: '/crm/pay', label: 'Pay' },
  ] },
  { key: 'financials', label: 'Financials', items: [
    { href: '/crm/financials', label: 'Reports' },
    { href: '/crm/cashflow', label: 'Cash Forecast' },
    { href: '/crm/settings', label: 'Settings' },
  ] },
];

export function CrmNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/crm' ? pathname === '/crm' : pathname.startsWith(href));
  const activeGroup = groups.find((g) => g.items.some((it) => isActive(it.href)))?.key;

  const [open, setOpen] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []));
  // Keep the section for the current page open as you navigate.
  useEffect(() => {
    if (activeGroup) setOpen((prev) => (prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)));
  }, [activeGroup]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const itemLink = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      className={
        'w-full rounded-full px-4 py-2 text-sm transition-colors ' +
        (isActive(href) ? 'bg-tulip text-ivory' : 'text-stone hover:bg-blush/60')
      }
    >
      {label}
    </Link>
  );

  return (
    <nav className="flex flex-col gap-1">
      {standalone.map((t) => itemLink(t.href, t.label))}

      {groups.map((g) => {
        const isOpen = open.has(g.key);
        const hasActive = g.items.some((it) => isActive(it.href));
        return (
          <div key={g.key} className="mt-1">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              className={
                'flex w-full items-center justify-between rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ' +
                (hasActive ? 'text-tulip' : 'text-stone hover:text-ink')
              }
              aria-expanded={isOpen}
            >
              {g.label}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={'h-3.5 w-3.5 transition-transform ' + (isOpen ? '' : '-rotate-90')}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isOpen && <div className="mt-0.5 flex flex-col gap-0.5 pl-2">{g.items.map((it) => itemLink(it.href, it.label))}</div>}
          </div>
        );
      })}
    </nav>
  );
}
