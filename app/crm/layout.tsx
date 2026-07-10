import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/crm/data';
import { getPeriod } from '@/lib/period';
import { isGoogleConnected } from '@/lib/google/tokens';
import { signOut } from '@/lib/crm/actions';
import { CrmSidebar } from '@/components/crm/CrmSidebar';
import { GoogleLink } from '@/components/crm/GoogleLink';
import { PeriodPicker } from '@/components/crm/PeriodPicker';
import { PerformanceTicker } from '@/components/crm/PerformanceTicker';

export const dynamic = 'force-dynamic';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');
  // Creators use their own portal, not the staff CRM.
  if (profile.role === 'talent') redirect('/portal');

  const isOwner = profile.role === 'owner' || profile.role === 'admin';
  const googleConnected = await isGoogleConnected();
  const period = await getPeriod();

  const periodPicker = (
    <PeriodPicker initialKey={period.key} initialFrom={period.from} initialTo={period.to} />
  );

  const roleBadge = (
    <span
      className={
        'rounded-full px-3 py-1 text-xs font-medium ' +
        (isOwner ? 'bg-tulip/15 text-tulip' : 'bg-stone/15 text-stone')
      }
    >
      {profile.role}
    </span>
  );

  // Account actions, stacked, for the mobile hamburger dropdown.
  const menuExtras = (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        {roleBadge}
        <span className="truncate text-stone">{profile.email}</span>
      </div>
      <GoogleLink connected={googleConnected} />
      <form action={signOut}>
        <button className="w-full rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-ivory md:flex">
      <CrmSidebar period={periodPicker} menuExtras={menuExtras} />

      {/* Main column */}
      <div className="min-w-0 flex-1">
        {/* Desktop-only toolbar; on mobile these controls live in the single top bar above */}
        <header className="sticky top-0 z-40 hidden border-b border-line bg-ivory/90 backdrop-blur md:block">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            {periodPicker}
            <div className="flex items-center gap-3">
              {roleBadge}
              <span className="hidden text-sm text-stone sm:inline">{profile.email}</span>
              <GoogleLink connected={googleConnected} />
              <form action={signOut}>
                <button className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className={'px-5 py-8' + (isOwner ? ' pb-16' : '')}>{children}</main>
      </div>

      {/* Futuristic performance crawl along the bottom (owner/admin) */}
      {isOwner && <PerformanceTicker />}
    </div>
  );
}
