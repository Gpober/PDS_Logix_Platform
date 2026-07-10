import Image from 'next/image';
import { redirect } from 'next/navigation';
import {
  getMyTalent,
  getTalentAccounts,
  getInstagramConnection,
  igExpiryDays,
  listMyDeals,
} from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { pullInstagramStats } from '@/lib/crm/actions';
import { TulipMark } from '@/components/TulipMark';
import { Empty } from '@/components/crm/ui';
import { AccountsManager } from '@/components/portal/AccountsManager';
import { IgReconnectBanner } from '@/components/portal/IgReconnectBanner';
import { PerformancePanel } from '@/components/portal/PerformancePanel';
import { PortalNav } from '@/components/portal/PortalNav';

export const dynamic = 'force-dynamic';

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const SYNC_MSG: Record<string, { text: string; ok?: boolean }> = {
  ok: { text: 'Followers synced from YouTube ✓', ok: true },
  connected: { text: 'YouTube connected ✓ — your channel is linked and verified.', ok: true },
  no_channel: { text: 'That Google account has no YouTube channel — connect one that owns a channel.' },
  save_failed: { text: 'Connected to YouTube, but couldn’t save it. (Is migration 0022 applied?)' },
  no_key: { text: 'YouTube sync isn’t turned on yet (missing API key). Ask your manager.' },
  unresolved: { text: 'Couldn’t read that YouTube account — add the channel handle (e.g. @name) or full channel URL.' },
  not_found: { text: 'No YouTube channel found for that handle/URL. Double-check it.' },
  api_error: { text: 'YouTube didn’t respond. Please try again in a moment.' },
  hidden: { text: 'That channel hides its subscriber count, so it can’t be pulled.' },
  unsupported: { text: 'Live sync isn’t available for that platform yet.' },
};

const IG_MSG: Record<string, { text: string; ok?: boolean }> = {
  ok: { text: 'Instagram stats synced ✓', ok: true },
  no_handle: { text: 'Connect Instagram or add your handle first, then sync.' },
  no_token: { text: 'Instagram lookups aren’t set up yet. Ask your manager.' },
  not_found: {
    text: 'Couldn’t read that Instagram — it must be a public Business/Creator account.',
  },
  save_failed: { text: 'Synced, but couldn’t save it. (Is migration 0032 applied?)' },
  no_talent: { text: 'Your creator profile isn’t linked yet.' },
};

const IGFB_MSG: Record<string, { text: string; ok?: boolean }> = {
  connected: { text: 'Instagram linked for stats ✓ — hit “Sync stats” to pull your numbers.', ok: true },
  no_app: { text: 'Instagram stats aren’t set up yet. Ask your manager.' },
  no_ig: {
    text: 'No Instagram Business account found on that Facebook Page. Link your IG to a Page, then try again.',
  },
  no_talent: { text: 'Your creator profile isn’t linked yet.' },
  save_failed: { text: 'Linked, but couldn’t save it. (Is migration 0033 applied?)' },
  error: { text: 'Something went wrong linking Instagram. Please try again.' },
};

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; ig?: string; igfb?: string }>;
}) {
  const { sync, ig, igfb } = await searchParams;
  const igMsg = ig ? IG_MSG[ig] : null;
  const igfbMsg = igfb ? IGFB_MSG[igfb] : null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const talent = await getMyTalent();
  const syncMsg = sync ? SYNC_MSG[sync] : null;

  return (
    <div className="min-h-screen bg-ivory">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/85 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-display text-xl">
            <TulipMark className="h-5 w-5 text-tulip" />
            Tulips<span className="text-tulip">.</span>{' '}
            <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-stone">
              Portal
            </span>
          </div>
          <PortalNav publicSlug={talent?.is_public ? talent.slug : null} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        {[syncMsg, igMsg, igfbMsg].filter(Boolean).map((m, i) => (
          <div
            key={i}
            className={
              'mx-auto mb-6 max-w-2xl rounded-xl px-4 py-2.5 text-center text-sm ' +
              (m!.ok
                ? 'border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 text-[#5B8C5A]'
                : 'border border-tulip/40 bg-blush/60 text-tulip-dark')
            }
          >
            {m!.text}
          </div>
        ))}
        {!talent ? (
          <Empty>
            Your creator profile isn&rsquo;t linked yet. Ask your Tulips manager to connect your
            account.
          </Empty>
        ) : (
          <PortalBody talent={talent} />
        )}
      </main>
    </div>
  );
}

async function PortalBody({
  talent,
}: {
  talent: NonNullable<Awaited<ReturnType<typeof getMyTalent>>>;
}) {
  const [deals, accounts, igConn] = await Promise.all([
    listMyDeals(),
    getTalentAccounts(talent.id),
    getInstagramConnection(talent.id),
  ]);

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <IgReconnectBanner days={igExpiryDays(igConn)} />
      </div>

      {/* ===== Welcome ===== */}
      <section className="mb-10 flex flex-col items-center gap-4 text-center">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-blush">
          {talent.headshot_url ? (
            <Image src={talent.headshot_url} alt={talent.name} fill className="object-cover" sizes="80px" />
          ) : (
            <span className="flex h-full items-center justify-center font-display text-3xl text-tulip">
              {talent.name.charAt(0)}
            </span>
          )}
        </div>
        <div>
          <p className="eyebrow">Creator Portal</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">
            Hi {talent.name.split(' ')[0]} <span className="italic text-tulip-dark">🌷</span>
          </h1>
          <p className="mt-1 text-sm text-stone">
            Your deals, earnings, and every account — in one place.
          </p>
        </div>
      </section>

      {/* ===== Performance (period filter + drill-down) ===== */}
      <PerformancePanel deals={deals} accounts={accounts} />

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* ===== My Accounts ===== */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl">My accounts</h2>
            {igConn ? (
              <span className="flex items-center gap-2 text-xs text-stone">
                📸 {igConn.username ? `@${igConn.username}` : 'Instagram'}{' '}
                <span className="text-[#5B8C5A]">connected ✓</span>
                <form action={pullInstagramStats} className="inline">
                  <input type="hidden" name="talent_id" value={talent.id} />
                  <input type="hidden" name="return_to" value="/portal" />
                  <button className="text-tulip underline-offset-2 hover:underline">Sync stats</button>
                </form>
                <a href="/api/instagram/connect" className="text-tulip underline-offset-2 hover:underline">
                  Reconnect
                </a>
              </span>
            ) : (
              <a
                href="/api/instagram/connect"
                className="rounded-full border border-line px-4 py-1.5 text-xs text-ink transition-colors hover:border-ink"
              >
                📸 Connect Instagram
              </a>
            )}
          </div>
          <AccountsManager talentId={talent.id} accounts={accounts} />
        </section>

        {/* ===== Deals ===== */}
        <section>
          <h2 className="mb-3 font-display text-xl">Your brand deals</h2>
          {deals.length === 0 ? (
            <Empty>No deals yet.</Empty>
          ) : (
            <div className="space-y-2">
              {deals.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{d.company_name}</p>
                    <p className="text-xs text-stone">{d.booking_date ?? 'Date TBD'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span
                      className={
                        'rounded-full px-2.5 py-1 text-xs ' +
                        (d.status === 'completed'
                          ? 'bg-[#5B8C5A]/10 text-[#5B8C5A]'
                          : 'bg-blush text-stone')
                      }
                    >
                      {d.status === 'completed' ? 'Paid' : 'In progress'}
                    </span>
                    <span className="font-display text-lg">
                      {d.gross != null ? usd(Number(d.gross)) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
