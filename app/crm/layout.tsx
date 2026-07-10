import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/crm/data';
import { signOut } from '@/lib/crm/actions';
import { CrmSidebar } from '@/components/crm/CrmSidebar';

export const dynamic = 'force-dynamic';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isOwner = profile.role === 'owner' || profile.role === 'admin';

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

  const menuExtras = (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        {roleBadge}
        <span className="truncate text-stone">{profile.email}</span>
      </div>
      <form action={signOut}>
        <button className="w-full rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-ivory md:flex">
      <CrmSidebar menuExtras={menuExtras} />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 hidden border-b border-line bg-ivory/90 backdrop-blur md:block">
          <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3">
            {roleBadge}
            <span className="hidden text-sm text-stone sm:inline">{profile.email}</span>
            <form action={signOut}>
              <button className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
