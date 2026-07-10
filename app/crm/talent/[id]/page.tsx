import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getCurrentProfile,
  getTalent,
  getTalentBilling,
  getTalentEarningRows,
  getTalentCadenceRows,
  getFollowerSnapshots,
} from '@/lib/crm/data';
import { monthlyEarnings, monthlyCadence, dailyFollowers } from '@/lib/crm/analytics';
import { linkTalentAccount, inviteTalent } from '@/lib/crm/actions';
import { listAsanaTasks } from '@/lib/asana/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { CrmHeader } from '@/components/crm/ui';
import { AnalyticsCharts } from '@/components/portal/AnalyticsCharts';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const LINK_MSG: Record<string, string> = {
  ok: 'Creator linked — they now have portal access.',
  invited: 'Invite sent ✓ — they’ll get an email to sign in, then their portal links automatically.',
  no_user: 'No account found with that email. Send them an invite instead.',
  no_email: 'Enter the creator’s email.',
  not_owner: 'Only an owner can grant portal access.',
  invite_failed: 'Could not save the invite. Please try again.',
  invite_email_failed: 'Invite saved, but the email didn’t send — is Google connected?',
  error: 'Could not link the account.',
};

export default async function TalentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ link?: string }>;
}) {
  const { id } = await params;
  const { link } = await searchParams;
  const talent = await getTalent(id);
  if (!talent) notFound();

  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  const billing = isOwner ? await getTalentBilling(id) : null;
  const asanaTasks = talent.asana_project_gid ? await listAsanaTasks(talent.asana_project_gid) : [];

  const [earningRows, cadenceRows, snapshots] = await Promise.all([
    getTalentEarningRows(id),
    getTalentCadenceRows(id),
    getFollowerSnapshots(id, 90),
  ]);
  const earnings = monthlyEarnings(earningRows, 12);
  const cadence = monthlyCadence(cadenceRows, 12);
  const followers = dailyFollowers(snapshots);

  // Companies this talent has worked with (via deals).
  const supabase = await createServerSupabase();
  const { data: deals } = await supabase
    .from('deals')
    .select('company_id, companies(name)')
    .eq('talent_id', id);
  const companies = Array.from(
    new Map(
      ((deals as { company_id: string; companies: { name: string } | null }[] | null) ?? []).map((d) => [
        d.company_id,
        d.companies?.name ?? 'Unknown',
      ]),
    ).entries(),
  );

  return (
    <>
      <div className="mb-4">
        <Link href="/crm/talent" className="text-sm text-stone hover:text-ink">
          ← Talent
        </Link>
      </div>
      <CrmHeader title={talent.name} newHref={`/crm/talent/${id}/edit`} newLabel="Edit" />

      {billing && (billing.billed > 0 || billing.owed > 0) && (
        <div className="mx-auto mb-8 max-w-lg text-center">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="text-xs uppercase tracking-wider text-stone">Paid</div>
              <div className="mt-1 font-display text-2xl text-[#5B8C5A]">{usd(billing.billed)}</div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="text-xs uppercase tracking-wider text-stone">Owed</div>
              <div className="mt-1 font-display text-2xl text-tulip">{usd(billing.owed)}</div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-4">
              <div className="text-xs uppercase tracking-wider text-stone">Total</div>
              <div className="mt-1 font-display text-2xl">{usd(billing.total)}</div>
            </div>
          </div>
          {billing.total > 0 && (
            <div className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-line">
              <div
                className="bg-[#5B8C5A]"
                style={{ width: `${(billing.billed / billing.total) * 100}%` }}
              />
              <div
                className="bg-tulip"
                style={{ width: `${(billing.owed / billing.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {isOwner && (
        <div className="mx-auto mb-8 max-w-lg text-center">
          {talent.user_id ? (
            <p className="rounded-xl border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 px-4 py-2 text-sm text-[#5B8C5A]">
              Portal access: linked ✓
            </p>
          ) : (
            <form action={inviteTalent} className="flex flex-col items-center gap-2">
              <input type="hidden" name="talent_id" value={talent.id} />
              <p className="text-sm text-stone">Invite this creator to their portal:</p>
              <div className="flex w-full gap-2">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="creator@email.com"
                  className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
                />
                <button className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-sm text-ivory transition-colors hover:bg-tulip">
                  Send invite
                </button>
              </div>
              <p className="text-xs text-stone/70">
                They’ll get an email to sign in (Google or email). Their portal links itself once
                they do.
              </p>
              <button
                formAction={linkTalentAccount}
                className="mt-1 text-xs text-stone underline-offset-2 hover:text-ink hover:underline"
              >
                Or link an account that already signed in
              </button>
            </form>
          )}
          {link && LINK_MSG[link] && (
            <p className={`mt-2 text-xs ${link === 'ok' ? 'text-[#5B8C5A]' : 'text-tulip'}`}>
              {LINK_MSG[link]}
            </p>
          )}
        </div>
      )}

      <div className="max-w-lg space-y-4 rounded-2xl border border-line bg-white p-6">
        {talent.headshot_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={talent.headshot_url}
            alt={talent.name}
            className="h-32 w-32 rounded-2xl border border-line object-cover"
          />
        )}
        {talent.handle && <Detail label="Handle" value={talent.handle} />}
        {talent.category && <Detail label="Category" value={talent.category} />}
        {talent.notes && <Detail label="Notes" value={talent.notes} />}
      </div>

      <section className="mt-10">
        <div className="mb-4 text-center">
          <h2 className="font-display text-xl">Performance</h2>
          <p className="text-sm text-stone">Earnings, audience, and posting rhythm over time.</p>
        </div>
        <AnalyticsCharts
          earnings={earnings}
          cadence={cadence}
          followers={followers}
          showMoney={isOwner}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-center font-display text-xl">Companies worked with</h2>
        {companies.length === 0 ? (
          <p className="text-stone">No bookings yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {companies.map(([companyId, name]) => (
              <Link
                key={companyId}
                href={`/crm/companies/${companyId}`}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-sm hover:border-ink"
              >
                {name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {talent.asana_project_gid && (
        <section className="mt-8">
          <div className="mb-3 flex flex-col items-center gap-1 text-center">
            <h2 className="font-display text-xl">Asana tasks</h2>
            <Link
              href={`/crm/tasks/${talent.asana_project_gid}`}
              className="text-sm text-tulip hover:underline"
            >
              Open project
            </Link>
          </div>
          {asanaTasks.length === 0 ? (
            <p className="text-center text-stone">No tasks synced for this creator yet.</p>
          ) : (
            <ul className="mx-auto max-w-xl space-y-2">
              {asanaTasks.map((t) => (
                <li
                  key={t.gid}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-sm"
                >
                  <span className={t.completed ? 'text-stone line-through' : ''}>{t.name}</span>
                  <span className="shrink-0 text-xs text-stone">
                    {t.completed ? 'Done' : (t.due_on ?? 'Open')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-stone">{label}</p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}
