import { getAllContentPosts, type AdminContentPost } from '@/lib/crm/data';
import { CrmHeader, Empty } from '@/components/crm/ui';
import { LocalTime } from '@/components/LocalTime';
import { ContentCalendar } from '@/components/portal/ContentCalendar';
import { TalentFilter } from '@/components/crm/TalentFilter';
import { ViewToggle } from '@/components/crm/ViewToggle';
import { SortHeader } from '@/components/crm/CompaniesToolbar';
import { platformIcon, platformLabel } from '@/lib/platforms';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  scheduled: 'bg-tulip/10 text-tulip',
  posted: 'bg-[#5B8C5A]/10 text-[#5B8C5A]',
  failed: 'bg-red-50 text-red-600',
  draft: 'bg-stone/10 text-stone',
  idea: 'bg-stone/10 text-stone',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={
        'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ' +
        (STATUS_STYLE[status] ?? 'bg-stone/10 text-stone')
      }
    >
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}

function PostRow({ post, when }: { post: AdminContentPost; when?: 'scheduled' | 'published' }) {
  const thumb = post.media_urls[0];
  const isVideo = thumb ? /\.(mp4|mov|m4v)$/i.test(thumb) : false;
  const iso = when === 'published' ? post.published_at : post.scheduled_at;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-white p-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-blush/40">
        {thumb ? (
          isVideo ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={thumb} className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg text-sage">▢</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-ink">{post.talent_name}</span>
          <span className="text-xs text-stone" title={platformLabel(post.platform)}>
            {platformIcon(post.platform)}
          </span>
          <StatusPill status={post.status} />
          {iso && (
            <span className="text-xs text-stone">
              · <LocalTime iso={iso} />
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-stone">
          {post.caption?.trim() || <span className="italic">No caption</span>}
        </p>
        {post.status === 'failed' && post.publish_error && (
          <p className="mt-0.5 text-xs text-red-600">⚠ {post.publish_error}</p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  accent,
  children,
}: {
  title: string;
  count: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg">
        {title}
        <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + (accent ?? 'bg-stone/10 text-stone')}>
          {count}
        </span>
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// Flat, sortable row for the list view.
function postWhen(p: AdminContentPost): string {
  return p.published_at ?? p.scheduled_at ?? p.scheduled_for ?? '';
}

function PostsTable({ posts }: { posts: AdminContentPost[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-stone">
          <tr>
            <SortHeader label="Creator" column="creator" />
            <SortHeader label="Platform" column="platform" />
            <SortHeader label="Status" column="status" />
            <th className="px-4 py-3 font-medium">Caption</th>
            <SortHeader label="When" column="when" />
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => {
            const iso = postWhen(p);
            return (
              <tr key={p.id} className="hover:bg-blush/30">
                <td className="border-t border-line px-4 py-3 font-medium text-ink">{p.talent_name}</td>
                <td className="border-t border-line px-4 py-3" title={platformLabel(p.platform)}>
                  {platformIcon(p.platform)}
                </td>
                <td className="border-t border-line px-4 py-3">
                  <StatusPill status={p.status} />
                </td>
                <td className="border-t border-line px-4 py-3 max-w-xs truncate text-stone">
                  {p.caption?.trim() || <span className="italic">No caption</span>}
                </td>
                <td className="border-t border-line px-4 py-3 text-stone">
                  {iso ? <LocalTime iso={iso} /> : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function CrmContentPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    talent?: string | string[];
    view?: string;
    sort?: string;
    order?: string;
  }>;
}) {
  const { month, talent, view: viewParam, sort, order } = await searchParams;
  const view = viewParam === 'list' ? 'list' : 'cards';
  const allPosts = await getAllContentPosts();

  // Every creator that has content, for the filter dropdown (built before filtering).
  const talents = [...new Map(allPosts.map((p) => [p.talent_id, p.talent_name])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Selected creators from the URL (?talent=…). Empty = show everyone.
  const selected = (Array.isArray(talent) ? talent : talent ? [talent] : []).filter((id) =>
    talents.some((t) => t.id === id),
  );
  const posts = selected.length ? allPosts.filter((p) => selected.includes(p.talent_id)) : allPosts;
  const talentQuery = selected.map((id) => `talent=${encodeURIComponent(id)}`).join('&');

  const now = new Date();
  const activeMonth =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Show the (filtered) posts on the calendar, tagged with the creator's name.
  const calendarPosts = posts.map((p) => ({
    id: p.id,
    scheduled_for: p.scheduled_for,
    status: p.status,
    platform: p.platform,
    caption: p.caption,
    label: p.talent_name,
  }));

  const failed = posts.filter((p) => p.status === 'failed');
  const scheduled = posts
    .filter((p) => p.status === 'scheduled')
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''));
  const posted = posts
    .filter((p) => p.status === 'posted')
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    .slice(0, 20);
  const planning = posts.filter((p) => p.status === 'idea' || p.status === 'draft');

  const creators = new Set(posts.map((p) => p.talent_id)).size;

  // Flat sorted list for the list view. Default: most recent first by date.
  const sortKey = sort ?? 'when';
  const dir = order === 'asc' ? 1 : order === 'desc' ? -1 : sortKey === 'when' ? -1 : 1;
  const sortedPosts = [...posts].sort((a, b) => {
    const val = (p: AdminContentPost) =>
      sortKey === 'creator'
        ? p.talent_name
        : sortKey === 'status'
          ? p.status
          : sortKey === 'platform'
            ? p.platform
            : postWhen(p);
    return val(a).localeCompare(val(b)) * dir;
  });

  return (
    <>
      <CrmHeader title="Content & schedule" />

      {allPosts.length === 0 ? (
        <Empty>No creator content yet. Posts your talent plan in their portal show up here.</Empty>
      ) : (
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="flex flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <TalentFilter talents={talents} selected={selected} />
              <ViewToggle />
            </div>
            <p className="text-center text-sm text-stone">
              {posts.length} post{posts.length === 1 ? '' : 's'} across {creators} creator
              {creators === 1 ? '' : 's'} · {scheduled.length} scheduled · {posted.length} recently
              posted
            </p>
          </div>

          <ContentCalendar
            posts={calendarPosts}
            month={activeMonth}
            basePath="/crm/content"
            extraQuery={talentQuery}
          />

          {posts.length === 0 && (
            <Empty>No posts for the selected creator{selected.length === 1 ? '' : 's'}.</Empty>
          )}

          {posts.length > 0 &&
            (view === 'list' ? (
              <PostsTable posts={sortedPosts} />
            ) : (
              <>
                {failed.length > 0 && (
                  <Section title="Needs attention" count={failed.length} accent="bg-red-50 text-red-600">
                    {failed.map((p) => (
                      <PostRow key={p.id} post={p} when="scheduled" />
                    ))}
                  </Section>
                )}

                <Section title="Upcoming schedule" count={scheduled.length} accent="bg-tulip/10 text-tulip">
                  {scheduled.length === 0 ? (
                    <Empty>Nothing scheduled right now.</Empty>
                  ) : (
                    scheduled.map((p) => <PostRow key={p.id} post={p} when="scheduled" />)
                  )}
                </Section>

                {posted.length > 0 && (
                  <Section
                    title="Recently published"
                    count={posted.length}
                    accent="bg-[#5B8C5A]/10 text-[#5B8C5A]"
                  >
                    {posted.map((p) => (
                      <PostRow key={p.id} post={p} when="published" />
                    ))}
                  </Section>
                )}

                {planning.length > 0 && (
                  <Section title="In planning" count={planning.length}>
                    {planning.map((p) => (
                      <PostRow key={p.id} post={p} />
                    ))}
                  </Section>
                )}
              </>
            ))}
        </div>
      )}
    </>
  );
}
