import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCompany, getCompanyRecord, getCompanyContacts, getCompanyTalent } from '@/lib/crm/data';
import { saveContact, deleteContact, deleteCompany } from '@/lib/crm/actions';
import { CrmHeader, Field, Checkbox, SubmitBar } from '@/components/crm/ui';
import type { Contact } from '@/lib/crm/types';

const TYPE_LABEL: Record<string, string> = { brand: 'Brand', agency: 'Agency', other: 'Other' };

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [company, record, talent, contacts] = await Promise.all([
    getCompany(id),
    getCompanyRecord(id),
    getCompanyTalent(id),
    getCompanyContacts(id),
  ]);
  if (!company) notFound();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/crm/companies" className="text-sm text-stone hover:text-ink">
          ← Companies
        </Link>
      </div>
      <CrmHeader title={company.name} newHref={`/crm/companies/${id}/edit`} newLabel="Edit" />

      <div className="mb-6 flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="rounded-full border border-line px-3 py-1 text-stone">
          {TYPE_LABEL[company.type] ?? company.type}
        </span>
        <span className="rounded-full border border-line px-3 py-1 text-stone capitalize">
          {company.status}
        </span>
        {company.is_public && (
          <span className="rounded-full bg-tulip/15 px-3 py-1 text-tulip">On public site</span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Stat label="Date last booked" value={company.date_last_booked ?? '—'} />
        <Stat label="Total bookings" value={String(company.deal_count)} />
        <div className="rounded-2xl border border-line bg-white p-5 text-center">
          <p className="text-xs uppercase tracking-wider text-stone">Most recent live link</p>
          {company.latest_live_url ? (
            <a
              href={company.latest_live_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-tulip hover:underline"
            >
              {company.latest_live_url}
            </a>
          ) : (
            <p className="mt-1 font-display text-2xl">—</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm text-stone">
        {company.category && <span>Category: {company.category}</span>}
        {company.employee_count != null && <span>Employees: {company.employee_count}</span>}
        {company.website && (
          <a href={company.website} target="_blank" rel="noreferrer" className="text-tulip">
            {company.website}
          </a>
        )}
      </div>
      {record?.notes && (
        <p className="mx-auto mt-4 max-w-2xl whitespace-pre-wrap text-center text-sm text-stone">
          {record.notes}
        </p>
      )}

      {/* ---- Contacts (live inside the company) ---- */}
      <section className="mt-10">
        <h2 className="mb-3 text-center font-display text-xl">Contacts</h2>
        {contacts.length === 0 ? (
          <p className="text-center text-stone">No contacts yet.</p>
        ) : (
          <ul className="mx-auto max-w-2xl space-y-2">
            {contacts.map((c) => (
              <ContactRow key={c.id} contact={c} companyId={id} />
            ))}
          </ul>
        )}

        <div className="mx-auto mt-4 max-w-2xl">
          <details className="rounded-2xl border border-dashed border-line bg-white p-4">
            <summary className="cursor-pointer text-sm font-medium text-tulip">
              + Add contact
            </summary>
            <form action={saveContact} className="mt-4 space-y-3">
              <input type="hidden" name="company_id" value={id} />
              <Field label="Name" name="name" required />
              <Field label="Title" name="title" placeholder="Brand Manager…" />
              <Field label="Email" name="email" type="email" />
              <Field label="Phone" name="phone" />
              <Checkbox label="Primary contact" name="is_primary" hint="The main point of contact for this company." />
              <SubmitBar label="Add contact" cancelHref={`/crm/companies/${id}`} />
            </form>
          </details>
        </div>
      </section>

      {/* ---- Talent worked with ---- */}
      <section className="mt-10">
        <h2 className="mb-3 text-center font-display text-xl">Talent worked with</h2>
        {talent.length === 0 ? (
          <p className="text-center text-stone">No talent booked yet.</p>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            {talent.map((t) => (
              <Link
                key={t.talent_id}
                href={`/crm/talent/${t.talent_id}`}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-ink"
              >
                {t.talent_name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---- Danger zone ---- */}
      <section className="mx-auto mt-12 max-w-2xl border-t border-line pt-6 text-center">
        <form action={deleteCompany}>
          <input type="hidden" name="id" value={id} />
          <button className="text-sm text-stone hover:text-red-600">Delete company</button>
        </form>
        <p className="mt-1 text-xs text-stone">Also removes its contacts and bookings.</p>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 text-center">
      <p className="text-xs uppercase tracking-wider text-stone">{label}</p>
      <p className="mt-1 font-display text-2xl">{value}</p>
    </div>
  );
}

function ContactRow({ contact: c, companyId }: { contact: Contact; companyId: string }) {
  return (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            {c.name}
            {c.is_primary && (
              <span className="ml-2 rounded-full bg-tulip/15 px-2 py-0.5 text-xs text-tulip">
                Primary
              </span>
            )}
          </p>
          {c.title && <p className="text-sm text-stone">{c.title}</p>}
          <div className="mt-1 flex flex-wrap gap-x-4 text-sm">
            {c.email && (
              <a href={`mailto:${c.email}`} className="text-tulip hover:underline">
                {c.email}
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="text-tulip hover:underline">
                {c.phone}
              </a>
            )}
          </div>
        </div>
        <details className="shrink-0">
          <summary className="cursor-pointer list-none text-sm text-stone hover:text-ink">Edit</summary>
          <form action={saveContact} className="mt-3 w-64 space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="company_id" value={companyId} />
            <Field label="Name" name="name" defaultValue={c.name} required />
            <Field label="Title" name="title" defaultValue={c.title} />
            <Field label="Email" name="email" type="email" defaultValue={c.email} />
            <Field label="Phone" name="phone" defaultValue={c.phone} />
            <Checkbox label="Primary contact" name="is_primary" defaultChecked={c.is_primary} />
            <div className="flex items-center gap-3 pt-1">
              <button className="rounded-full bg-ink px-4 py-1.5 text-sm text-ivory hover:bg-tulip">
                Save
              </button>
            </div>
          </form>
        </details>
      </div>
      <form action={deleteContact} className="mt-2">
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="company_id" value={companyId} />
        <button className="text-xs text-stone hover:text-red-600">Remove contact</button>
      </form>
    </li>
  );
}
