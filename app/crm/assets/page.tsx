import { listAssets, clientOptions } from '@/lib/crm/data';
import { CrmHeader, Empty, Table, Td, Th } from '@/components/crm/ui';
import { vehicleLabel } from '@/lib/format';

export default async function AssetsPage() {
  const [assets, clients] = await Promise.all([listAssets(), clientOptions()]);
  const cMap = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <>
      <CrmHeader title="Vehicles" newHref="/crm/assets/new" newLabel="New vehicle" />
      {assets.length === 0 ? (
        <Empty>No vehicles yet.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <Th>Vehicle</Th>
              <Th>VIN</Th>
              <Th>Plate</Th>
              <Th>Mileage</Th>
              <Th>Client</Th>
            </tr>
          }
        >
          {assets.map((a) => (
            <tr key={a.id} className="hover:bg-mist/50">
              <Td>
                <span className="font-medium">{vehicleLabel(a)}</span>
                {a.color && <span className="text-stone"> · {a.color}</span>}
              </Td>
              <Td>{a.vin ?? '—'}</Td>
              <Td>{a.license_plate ?? '—'}</Td>
              <Td>{a.mileage ? a.mileage.toLocaleString() : '—'}</Td>
              <Td>{a.client_id ? cMap.get(a.client_id) ?? '—' : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
