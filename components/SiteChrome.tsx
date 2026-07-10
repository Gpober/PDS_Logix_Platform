'use client';

import { usePathname } from 'next/navigation';

// The public marketing header/footer belong only on the public site. The logged-in
// app screens (portal, CRM, login, auth) have their own headers, so we skip the
// marketing chrome there to avoid a doubled-up header. header/footer are passed in
// as elements so they can stay server components.
const APP_ROUTE = /^\/(portal|crm|login|auth)(\/|$)/;

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  if (APP_ROUTE.test(pathname)) return <>{children}</>;

  return (
    <>
      {header}
      <main className="flex-1">{children}</main>
      {footer}
    </>
  );
}
