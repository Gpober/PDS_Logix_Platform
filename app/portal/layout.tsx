import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentProfile, getMyStaff } from '@/lib/crm/data';
import { signOut } from '@/lib/crm/actions';
import { PortalNav } from '@/components/portal/PortalNav';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const staff = await getMyStaff();

  // No staff row is linked to this login — the portal can't scope to a person.
  // Owners/admins land here if they open the portal without a matching staff
  // record; point them back to the CRM. Everyone else gets a clear message.
  if (!staff) {
    const isOwner = profile.role === 'owner' || profile.role === 'admin';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ivory px-6 text-center">
        <h1 className="font-display text-2xl">Worker portal</h1>
        <p className="max-w-sm text-sm text-stone">
          We couldn’t find a team member linked to <span className="text-ink">{profile.email}</span>. Ask an admin to add
          you to the staff roster with this email address, then sign back in.
        </p>
        <div className="flex items-center gap-3">
          {isOwner && (
            <Link href="/crm" className="rounded-full bg-tulip px-4 py-2 text-sm text-ivory hover:bg-tulip-dark">
              Go to the CRM
            </Link>
          )}
          <form action={signOut}>
            <button className="rounded-full border border-line px-4 py-2 text-sm text-stone hover:border-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory">
      {/* Top bar — greeting + sign out. Sticky on mobile, full-width on desktop. */}
      <header className="sticky top-0 z-40 border-b border-line bg-ivory/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="flex items-center gap-2">
            <span className="font-display text-lg">PDS Logix</span>
            <span className="hidden text-sm text-stone sm:inline">· {staff.name}</span>
          </span>
          <form action={signOut}>
            <button className="rounded-full border border-line px-3 py-1.5 text-xs text-stone hover:border-ink">
              Sign out
            </button>
          </form>
        </div>
        {/* Desktop tab row lives in the header; mobile gets the bottom bar below. */}
        <div className="mx-auto hidden max-w-3xl px-2 md:block">
          <PortalNav />
        </div>
      </header>

      {/* Extra bottom padding on mobile so the fixed nav never covers content. */}
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:pb-10">{children}</main>

      <div className="md:hidden">
        <PortalNav />
      </div>
    </div>
  );
}
