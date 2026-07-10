import Link from 'next/link';
import { listAssets } from '@/lib/crm/data';
import { assetLabel } from '@/lib/crm/types';
import { CrmHeader, Table, Th, Td, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const assets = await listAssets();
  return (
    <div className="mx-auto max-w-5xl">
      <CrmHeader title="Assets" newHref="/crm/assets/new" newLabel="New asset" />
      {assets.length === 0 ? (
        <Empty>No assets yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Asset</Th>
              <Th>Client</Th>
              <Th>VIN</Th>
              <Th>Plate</Th>
              <Th>Mileage</Th>
            </tr>
          }
        >
          {assets.map((a) => (
            <tr key={a.id} className="hover:bg-blush/30">
              <Td>
                <Link href={`/crm/assets/${a.id}/edit`} className="font-medium hover:underline">
                  {assetLabel(a)}
                </Link>
              </Td>
              <Td>
                {a.client_id ? (
                  <Link href={`/crm/clients/${a.client_id}`} className="hover:underline">
                    {a.client_name ?? '—'}
                  </Link>
                ) : (
                  '—'
                )}
              </Td>
              <Td>{a.vin ?? '—'}</Td>
              <Td>{a.license_plate ?? '—'}</Td>
              <Td>{a.mileage ?? '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
