import Link from 'next/link';
import { listConditionReports } from '@/lib/crm/data';
import { CrmHeader, Empty, Pill, Table, Td, Th } from '@/components/crm/ui';

export default async function ReportsPage() {
  const reports = await listConditionReports();

  return (
    <>
      <CrmHeader title="Condition Reports" />
      {reports.length === 0 ? (
        <Empty>
          No condition reports yet. Open a condition-report job and file one from its page.
        </Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Client</Th>
              <Th>Vehicle</Th>
              <Th>Grade</Th>
              <Th>Findings</Th>
              <Th>Mileage</Th>
              <Th>Inspected</Th>
            </tr>
          }
        >
          {reports.map((r) => (
            <tr key={r.id} className="hover:bg-mist/50">
              <Td>
                <Link href={`/crm/jobs/${r.job_id}`} className="font-medium text-ink hover:text-pds-dark">
                  {r.client_name}
                </Link>
              </Td>
              <Td>{r.vehicle}</Td>
              <Td>{r.overall_grade ? <Pill className="bg-mist text-steel">{r.overall_grade}</Pill> : '—'}</Td>
              <Td>{r.finding_count}</Td>
              <Td>{r.mileage ? r.mileage.toLocaleString() : '—'}</Td>
              <Td>{r.inspected_at ? new Date(r.inspected_at).toLocaleDateString() : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
