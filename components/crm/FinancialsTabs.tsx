'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/crm/financials', label: 'Overview', exact: true },
  { href: '/crm/financials/pnl', label: 'P&L' },
  { href: '/crm/financials/balance-sheet', label: 'Balance Sheet' },
  { href: '/crm/financials/ar', label: 'A/R' },
  { href: '/crm/financials/ap', label: 'A/P' },
  { href: '/crm/financials/cash-flow', label: 'Cash Flow' },
];

export function FinancialsTabs() {
  const pathname = usePathname();
  return (
    <div className="-mt-2 flex gap-1 overflow-x-auto border-b border-line pb-px">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ' +
              (active ? 'border-tulip font-medium text-ink' : 'border-transparent text-stone hover:text-ink')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
