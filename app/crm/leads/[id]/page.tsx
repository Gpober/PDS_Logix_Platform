import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLead } from '@/lib/crm/data';
import { sendLeadEmail } from '@/lib/crm/actions';
import { isGoogleConnected } from '@/lib/google/tokens';
import { CrmHeader, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

const field =
  'w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink';

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { id } = await params;
  const { sent, error } = await searchParams;
  const lead = await getLead(id);
  if (!lead) notFound();

  const connected = await isGoogleConnected();
  const today = new Date().toISOString().slice(0, 10);
  const due = lead.next_eligible_on != null && lead.next_eligible_on <= today;

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/leads" className="text-sm text-stone hover:text-ink">
          ← Leads
        </Link>
      </div>
      <CrmHeader title={lead.name} />

      <div className="mx-auto max-w-2xl">
        {/* Lead facts */}
        <div className="rounded-2xl border border-line bg-white p-5 text-center">
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="text-tulip hover:underline">
              {lead.email}
            </a>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-stone">
            {lead.owner && <span>Owner: {lead.owner}</span>}
            {lead.company && <span>{lead.company}</span>}
            {lead.last_pitch_text && <span>Last pitch: {lead.last_pitch_text}</span>}
            {lead.next_eligible_text && (
              <span className="inline-flex items-center gap-2">
                Next eligible: {lead.next_eligible_text}
                {due && (
                  <span className="rounded-full bg-tulip/15 px-2 py-0.5 text-xs font-medium text-tulip">
                    Due
                  </span>
                )}
              </span>
            )}
            <span>Source: {lead.source === 'asana:pitch-engine' ? 'Pitch engine' : lead.source}</span>
          </div>

          {(lead.history || lead.fit) && (
            <div className="mt-4 space-y-2 text-left text-sm text-ink/90">
              {lead.history && (
                <p>
                  <span className="font-medium text-stone">History: </span>
                  {lead.history}
                </p>
              )}
              {lead.fit && (
                <p>
                  <span className="font-medium text-stone">Fit: </span>
                  {lead.fit}
                </p>
              )}
            </div>
          )}

          {/* Raw notes only for non-pitch leads (pitch data is shown structured above). */}
          {lead.message && lead.source !== 'asana:pitch-engine' && (
            <p className="mt-4 whitespace-pre-wrap text-left text-sm text-ink/90">{lead.message}</p>
          )}
        </div>

        {/* Send status */}
        {sent && (
          <p className="mt-6 rounded-xl border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 px-4 py-3 text-center text-sm text-[#5B8C5A]">
            Email sent from your Gmail.
          </p>
        )}
        {error && (
          <p className="mt-6 rounded-xl border border-tulip/40 bg-tulip/10 px-4 py-3 text-center text-sm text-tulip">
            {error}
          </p>
        )}

        {/* Compose */}
        <section className="mt-8">
          <h2 className="mb-3 text-center font-display text-xl">Email this lead</h2>
          {connected ? (
            <form action={sendLeadEmail} className="space-y-4">
              <input type="hidden" name="lead_id" value={lead.id} />
              <input type="hidden" name="to" value={lead.email} />
              <label className="block">
                <span className="mb-1.5 block text-sm text-stone">To</span>
                <input value={lead.email} readOnly className={field + ' bg-ivory/60'} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-stone">Subject</span>
                <input
                  name="subject"
                  defaultValue={`Re: your enquiry with Tulips Talent`}
                  className={field}
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-stone">Message</span>
                <textarea name="body" rows={6} className={field} required />
              </label>
              <div className="text-center">
                <button className="rounded-full bg-ink px-6 py-2.5 text-sm text-ivory transition-colors hover:bg-tulip">
                  Send via Gmail
                </button>
              </div>
            </form>
          ) : (
            <Empty>
              Connect Google to email leads from the CRM. Sign out and use{' '}
              <span className="text-ink">Continue with Google</span> to grant Gmail access.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
