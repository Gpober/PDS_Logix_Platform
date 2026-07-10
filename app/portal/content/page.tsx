import { redirect } from 'next/navigation';
import {
  getMyTalent,
  getContentPosts,
  getContentMedia,
  getInstagramConnection,
  getTikTokConnection,
  igExpiryDays,
  listMyDeals,
} from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';
import { deleteContentMedia } from '@/lib/crm/actions';
import { TulipMark } from '@/components/TulipMark';
import { Empty } from '@/components/crm/ui';
import { anthropicConfigured } from '@/lib/integrations/anthropic';
import { MediaUploader } from '@/components/portal/MediaUploader';
import { PostEditor } from '@/components/portal/PostEditor';
import { ContentCalendar } from '@/components/portal/ContentCalendar';
import { IgReconnectBanner } from '@/components/portal/IgReconnectBanner';
import { PortalNav } from '@/components/portal/PortalNav';

export const dynamic = 'force-dynamic';

const IG_MSG: Record<string, { text: string; ok?: boolean }> = {
  connected: { text: 'Instagram connected ✓ — you can publish posts now.', ok: true },
  published: { text: 'Published to Instagram ✓', ok: true },
  processing: { text: 'Your video is still encoding on Instagram — hit Publish again in a minute.' },
  no_app: { text: 'Instagram publishing isn’t set up yet (missing Facebook app). Ask your manager.' },
  no_business: {
    text: 'No Instagram Business account found. Switch your IG to a Business/Creator account linked to a Facebook Page, then reconnect.',
  },
  not_connected: { text: 'Connect Instagram first, then publish.' },
  no_media: { text: 'Add a photo to the post before publishing.' },
  publish_failed: { text: 'Instagram rejected the post. Check the image and caption, then retry.' },
  save_failed: { text: 'Connected, but couldn’t save it. (Is migration 0024 applied?)' },
  error: { text: 'Something went wrong connecting Instagram. Please try again.' },
  no_talent: { text: 'Your creator profile isn’t linked yet.' },
};

const TT_MSG: Record<string, { text: string; ok?: boolean }> = {
  connected: { text: 'TikTok connected ✓ — you can publish posts now.', ok: true },
  published: { text: 'Sent to TikTok ✓ — it may take a moment to appear.', ok: true },
  no_app: { text: 'TikTok publishing isn’t set up yet. Ask your manager.' },
  not_connected: { text: 'Connect TikTok first, then publish.' },
  no_media: { text: 'Add a video or photo before publishing.' },
  publish_failed: { text: 'TikTok rejected the post. Check the media and caption, then retry.' },
  save_failed: { text: 'Connected, but couldn’t save it. (Is migration 0026 applied?)' },
  error: { text: 'Something went wrong connecting TikTok. Please try again.' },
  no_talent: { text: 'Your creator profile isn’t linked yet.' },
};

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; ig?: string; tt?: string }>;
}) {
  const { month, ig, tt } = await searchParams;
  const igMsg = ig ? IG_MSG[ig] : null;
  const ttMsg = tt ? TT_MSG[tt] : null;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const talent = await getMyTalent();
  if (!talent) {
    return (
      <div className="container-x py-10">
        <Empty>Your creator profile isn’t linked yet.</Empty>
      </div>
    );
  }

  const [posts, media, deals, igConn, ttConn] = await Promise.all([
    getContentPosts(talent.id),
    getContentMedia(talent.id),
    listMyDeals(),
    getInstagramConnection(talent.id),
    getTikTokConnection(talent.id),
  ]);

  const now = new Date();
  const activeMonth =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const aiEnabled = anthropicConfigured();

  const dealLabel = (id: string | null) =>
    id ? deals.find((d) => d.id === id)?.company_name ?? 'Company deal' : null;

  const byDeal = new Map<string, { label: string; total: number; posted: number }>();
  for (const p of posts) {
    if (!p.deal_id) continue;
    const g = byDeal.get(p.deal_id) ?? { label: dealLabel(p.deal_id) ?? 'Company deal', total: 0, posted: 0 };
    g.total += 1;
    if (p.status === 'posted') g.posted += 1;
    byDeal.set(p.deal_id, g);
  }

  return (
    <div className="min-h-screen bg-ivory">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/85 backdrop-blur">
        <div className="container-x flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-display text-xl">
            <TulipMark className="h-5 w-5 text-tulip" />
            Tulips<span className="text-tulip">.</span>{' '}
            <span className="text-[0.7rem] font-medium uppercase tracking-[0.2em] text-stone">
              Studio
            </span>
          </div>
          <PortalNav publicSlug={talent.is_public ? talent.slug : null} />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        {/* Notices — centered + narrow */}
        <div className="mx-auto max-w-2xl">
          <IgReconnectBanner days={igExpiryDays(igConn)} />
          <IgReconnectBanner
            days={igExpiryDays(ttConn)}
            label="TikTok"
            href="/api/tiktok/connect"
            emoji="🎵"
          />
          {[igMsg, ttMsg].filter(Boolean).map((m, i) => (
            <div
              key={i}
              className={
                'mb-6 rounded-xl px-4 py-2.5 text-center text-sm ' +
                (m!.ok
                  ? 'border border-[#5B8C5A]/40 bg-[#5B8C5A]/10 text-[#5B8C5A]'
                  : 'border border-tulip/40 bg-blush/60 text-tulip-dark')
              }
            >
              {m!.text}
            </div>
          ))}
        </div>

        {/* Intro — centered, editorial */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Content Studio</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] sm:text-5xl">
            Plan your posts with <span className="italic text-tulip-dark">intention.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-stone">
            Schedule to Instagram &amp; TikTok, link posts to brand deals, and keep your media in one
            place.
          </p>

          {/* Connections */}
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <a
              href="/api/instagram/connect"
              className={
                'rounded-full border px-4 py-2 text-sm transition-colors ' +
                (igConn?.username
                  ? 'border-[#5B8C5A]/40 bg-[#5B8C5A]/10 text-[#5B8C5A]'
                  : 'border-line text-ink hover:border-ink')
              }
            >
              {igConn?.username ? `📸 @${igConn.username} ✓` : '📸 Connect Instagram'}
            </a>
            <a
              href="/api/tiktok/connect"
              className={
                'rounded-full border px-4 py-2 text-sm transition-colors ' +
                (ttConn?.username
                  ? 'border-[#5B8C5A]/40 bg-[#5B8C5A]/10 text-[#5B8C5A]'
                  : 'border-line text-ink hover:border-ink')
              }
            >
              {ttConn?.username ? `🎵 ${ttConn.username} ✓` : '🎵 Connect TikTok'}
            </a>
          </div>
        </div>

        {/* Calendar */}
        <section className="mt-14">
          <ContentCalendar posts={posts} month={activeMonth} />
        </section>

        {/* Deliverables summary */}
        {byDeal.size > 0 && (
          <section className="mt-16">
            <div className="text-center">
              <p className="eyebrow">Brand Deals</p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl">Deliverables</h2>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...byDeal.values()].map((g) => (
                <div key={g.label} className="rounded-2xl border border-line bg-white p-5">
                  <p className="font-medium text-ink">{g.label}</p>
                  <p className="mt-1 text-sm text-stone">
                    {g.posted}/{g.total} posted
                  </p>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full bg-[#5B8C5A]"
                      style={{ width: `${g.total ? (g.posted / g.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Planned posts */}
        <section className="mt-16">
          <div className="text-center">
            <p className="eyebrow">Your Calendar</p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl">Planned posts</h2>
          </div>
          <div className="mx-auto mt-8 max-w-2xl space-y-4">
            {posts.map((p) => (
              <PostEditor
                key={p.id}
                talentId={talent.id}
                deals={deals}
                media={media}
                post={p}
                dealLabel={dealLabel(p.deal_id)}
                aiEnabled={aiEnabled}
              />
            ))}
            <div className="pt-2">
              <p className="mb-2 text-center text-sm font-medium text-stone">＋ Add a post</p>
              <PostEditor talentId={talent.id} deals={deals} media={media} aiEnabled={aiEnabled} />
            </div>
          </div>
        </section>

        {/* Media library */}
        <section className="mt-16">
          <div className="flex flex-col items-center gap-3 text-center">
            <div>
              <p className="eyebrow">Your Assets</p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl">Media library</h2>
            </div>
            <MediaUploader talentId={talent.id} />
          </div>
          <div className="mx-auto mt-8 max-w-3xl">
            {media.length === 0 ? (
              <Empty>No media yet — upload photos or videos to use in your posts.</Empty>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className="group relative overflow-hidden rounded-xl border border-line bg-white"
                  >
                    {m.kind === 'video' ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video src={m.url} className="aspect-square w-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt="" className="aspect-square w-full object-cover" />
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-ink/60 px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[0.65rem] text-ivory hover:underline"
                      >
                        Open
                      </a>
                      <form action={deleteContentMedia}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="text-[0.65rem] text-ivory hover:text-tulip">Delete</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-center text-xs text-stone">
              Upload here, then attach any file to a post with “Choose from library.”
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
