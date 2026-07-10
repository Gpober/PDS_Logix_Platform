import Link from 'next/link';
import { getCurrentProfile } from '@/lib/crm/data';
import { listAsanaProjects, lastAsanaSync } from '@/lib/asana/data';
import { isAsanaConfigured } from '@/lib/asana/client';
import { SyncAsanaButton } from '@/components/crm/SyncAsanaButton';
import { Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  const [projects, synced] = await Promise.all([listAsanaProjects(), lastAsanaSync()]);
  const configured = isAsanaConfigured();

  return (
    <>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-3xl">Tasks</h1>
        <p className="-mt-1 text-sm text-stone">
          Projects &amp; tasks mirrored from Asana
          {synced ? ` · last synced ${synced.slice(0, 10)}` : ''}
        </p>
        {isOwner &&
          (configured ? (
            <SyncAsanaButton />
          ) : (
            <span className="text-xs text-stone">
              Set <code className="text-ink">ASANA_TOKEN</code> on the server to enable sync.
            </span>
          ))}
      </div>

      {projects.length === 0 ? (
        <Empty>No Asana projects imported yet.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.gid}
              href={`/crm/tasks/${p.gid}`}
              className="rounded-2xl border border-line bg-white p-5 text-center transition-colors hover:border-ink"
            >
              <div className="font-display text-lg">{p.name}</div>
              <div className="mt-2 text-xs uppercase tracking-wider text-stone">
                {p.num_incomplete_tasks ?? 0} open · {p.num_completed_tasks ?? 0} done
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
