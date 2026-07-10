import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAsanaProject, listAsanaTasks, talentForProject } from '@/lib/asana/data';
import { CrmHeader, Empty, Table, Td, Th } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function AsanaProjectPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const project = await getAsanaProject(gid);
  if (!project) notFound();

  const [tasks, talent] = await Promise.all([listAsanaTasks(gid), talentForProject(gid)]);

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/tasks" className="text-sm text-stone hover:text-ink">
          ← Tasks
        </Link>
      </div>
      <CrmHeader title={project.name} />
      {talent && (
        <p className="mb-6 -mt-3 text-center text-sm text-stone">
          Linked talent:{' '}
          <Link href={`/crm/talent/${talent.id}`} className="text-tulip hover:underline">
            {talent.name}
          </Link>
        </p>
      )}

      {tasks.length === 0 ? (
        <Empty>No tasks in this project.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Task</Th>
              <Th>Assignee</Th>
              <Th>Due</Th>
              <Th>Status</Th>
            </tr>
          }
        >
          {tasks.map((t) => (
            <tr key={t.gid} className="hover:bg-blush/30">
              <Td>
                <Link
                  href={`/crm/tasks/${gid}/${t.gid}`}
                  className={`font-medium hover:text-tulip ${t.completed ? 'text-stone line-through' : ''}`}
                >
                  {t.name}
                </Link>
              </Td>
              <Td>{t.assignee_name ?? '—'}</Td>
              <Td>{t.due_on ?? '—'}</Td>
              <Td>
                <span className={t.completed ? 'text-[#5B8C5A]' : 'text-stone'}>
                  {t.completed ? 'Done' : 'Open'}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
