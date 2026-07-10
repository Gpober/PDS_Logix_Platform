import { formatCount } from '@/lib/format';
import type { InstagramStats } from '@/lib/crm/data';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white/40 p-5 text-center">
      <p className="font-display text-3xl leading-none sm:text-4xl">{value}</p>
      <p className="mt-1.5 text-xs uppercase tracking-wider text-stone">{label}</p>
    </div>
  );
}

// Horizontal breakdown bars (audience age / country), sorted high→low.
function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const rows = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className="rounded-2xl border border-line bg-white/40 p-6">
      <p className="font-medium text-ink">{title}</p>
      <div className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 text-stone">{label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-tulip" style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right text-ink">{value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TalentInstagramStats({ stats }: { stats: InstagramStats }) {
  const posts = (stats.recent_posts ?? []).filter((p) => p.mediaUrl);

  return (
    <div className="mt-10 space-y-8">
      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.followers != null && <Tile label="Followers" value={formatCount(stats.followers)} />}
        {stats.engagement_rate != null && (
          <Tile label="Engagement" value={`${stats.engagement_rate}%`} />
        )}
        {stats.avg_post_likes != null && (
          <Tile label="Avg likes" value={formatCount(stats.avg_post_likes)} />
        )}
        {stats.avg_post_comments != null && (
          <Tile label="Avg comments" value={formatCount(stats.avg_post_comments)} />
        )}
        {stats.reach != null && <Tile label="Reach (28d)" value={formatCount(stats.reach)} />}
      </div>

      {/* Recent posts */}
      {posts.length > 0 && (
        <div>
          <p className="mb-3 text-sm text-stone">Recent posts</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {posts.slice(0, 6).map((p, i) => (
              <a
                key={i}
                href={p.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-blush"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.mediaUrl!} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center gap-3 bg-ink/55 text-xs font-medium text-ivory opacity-0 transition-opacity group-hover:opacity-100">
                  <span>♥ {formatCount(p.likeCount)}</span>
                  <span>💬 {formatCount(p.commentsCount)}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Audience demographics (Insights — only when connected + approved) */}
      {stats.has_insights && (stats.audience_gender || stats.audience_age || stats.audience_country) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {stats.audience_gender && <Breakdown title="Audience gender" data={stats.audience_gender} />}
          {stats.audience_age && <Breakdown title="Audience age" data={stats.audience_age} />}
          {stats.audience_country && (
            <Breakdown title="Top countries" data={stats.audience_country} />
          )}
        </div>
      )}

      {stats.synced_at && (
        <p className="text-xs text-stone">
          Instagram stats · updated{' '}
          {new Date(stats.synced_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
    </div>
  );
}
