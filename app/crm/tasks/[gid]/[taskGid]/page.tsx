import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAsanaTask } from '@/lib/asana/data';
import { CrmHeader } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function AsanaTaskPage({
  params,
}: {
  params: Promise<{ gid: string; taskGid: string }>;
}) {
  const { gid, taskGid } = await params;
  const task = await getAsanaTask(taskGid);
  if (!task) notFound();

  return (
    <>
      <div className="mb-4">
        <Link href={`/crm/tasks/${gid}`} className="text-sm text-stone hover:text-ink">
          ← {task.project_name ?? 'Project'}
        </Link>
      </div>
      <CrmHeader title={task.name} />

      <div className="mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-stone">
          <span className={task.completed ? 'text-[#5B8C5A]' : 'text-stone'}>
            {task.completed ? 'Done' : 'Open'}
          </span>
          {task.assignee_name && <span>Assignee: {task.assignee_name}</span>}
          {task.due_on && <span>Due: {task.due_on}</span>}
          {task.created_at && <span>Created: {task.created_at.slice(0, 10)}</span>}
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-white p-5">
          {task.notes ? (
            <p className="whitespace-pre-wrap text-sm text-ink/90">{task.notes}</p>
          ) : (
            <p className="text-center text-sm text-stone">
              No description synced yet. Run <span className="text-ink">Sync Asana</span> to pull
              task descriptions.
            </p>
          )}
        </div>

        {task.permalink_url && (
          <div className="mt-6 text-center">
            <a
              href={task.permalink_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
            >
              Open in Asana ↗
            </a>
          </div>
        )}
      </div>
    </>
  );
}
