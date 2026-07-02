import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/crm/data';
import { signOut } from '@/lib/crm/actions';
import { CrmSidebar } from '@/components/crm/CrmSidebar';

export const dynamic = 'force-dynamic';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect('/login');

  const isOwner = profile.role === 'owner' || profile.role === 'admin';

  return (
    <div className="min-h-screen bg-base md:flex">
      <CrmSidebar />

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-line bg-base/90 backdrop-blur">
          <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3">
            <span
              className={
                'rounded-full px-3 py-1 text-xs font-medium ' +
                (isOwner ? 'bg-pds/20 text-pds-dark' : 'bg-stone/15 text-stone')
              }
            >
              {profile.role}
            </span>
            <span className="hidden text-sm text-stone sm:inline">{profile.email}</span>
            <form action={signOut}>
              <button className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="px-5 py-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
