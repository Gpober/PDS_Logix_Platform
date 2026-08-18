import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLead } from '@/lib/crm/data';
import { deleteLead } from '@/lib/crm/actions';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-stone">{label}</div>
      <div className="mt-0.5 text-sm break-words">{value || '—'}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? 'new').toLowerCase();
  const tone =
    s === 'new'
      ? 'bg-blush/50 text-ink'
      : s === 'contacted'
        ? 'bg-amber-100 text-amber-800'
        : s === 'qualified' || s === 'won'
          ? 'bg-green-100 text-green-800'
          : s === 'lost' || s === 'unsubscribed'
            ? 'bg-stone/20 text-stone'
            : 'bg-blush/50 text-ink';
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium capitalize ${tone}`}>{s}</span>
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/crm/leads" className="text-sm text-stone hover:text-ink">
        ← Back to leads
      </Link>

      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{lead.name}</h1>
          <div className="mt-1 text-sm text-stone">
            {[lead.contact_title, lead.company].filter(Boolean).join(' · ') || lead.company || '—'}
          </div>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      {/* Quick actions */}
      <div className="mb-6 flex flex-wrap gap-2">
        <a
          href={`mailto:${lead.email}`}
          className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
        >
          Email
        </a>
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
          >
            Call
          </a>
        )}
        {lead.linkedin_url && (
          <a
            href={lead.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line px-4 py-2 text-sm hover:border-ink"
          >
            LinkedIn ↗
          </a>
        )}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
        <Detail label="Company" value={lead.company} />
        <Detail label="Contact title" value={lead.contact_title} />
        <Detail label="Service" value={lead.service_type} />
        <Detail
          label="Email"
          value={
            <a href={`mailto:${lead.email}`} className="text-tulip hover:underline">
              {lead.email}
            </a>
          }
        />
        <Detail
          label="Phone"
          value={lead.phone ? <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a> : null}
        />
        <Detail label="State" value={lead.state} />
        <Detail
          label="LinkedIn"
          value={
            lead.linkedin_url ? (
              <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-tulip hover:underline">
                View profile ↗
              </a>
            ) : null
          }
        />
        <Detail label="Address" value={lead.address} />
        <Detail label="Source" value={lead.source} />
        <Detail label="Group" value={lead.lead_group} />
        <Detail label="Received" value={formatDate(lead.created_at)} />
      </div>

      {lead.message && (
        <div className="mt-4 rounded-2xl border border-line bg-white p-5">
          <div className="text-xs uppercase tracking-wider text-stone">Notes</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{lead.message}</p>
        </div>
      )}

      <div className="mt-8">
        <form action={deleteLead.bind(null, lead.id)}>
          <button className="text-xs text-stone hover:text-tulip">Delete lead</button>
        </form>
      </div>
    </div>
  );
}
