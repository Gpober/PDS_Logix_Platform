'use client';

import { useEffect, useState } from 'react';
import { saveContentPost, deleteContentPost, publishContentPost, draftCaption } from '@/lib/crm/actions';
import { PLATFORMS } from '@/lib/platforms';
import type { ContentPost, ContentMedia, PortalDeal } from '@/lib/crm/data';

const STATUSES = ['idea', 'draft', 'scheduled', 'posted', 'failed'];
const fieldCls =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink';

export function PostEditor({
  talentId,
  deals,
  media,
  post,
  dealLabel,
  aiEnabled = false,
}: {
  talentId: string;
  deals: PortalDeal[];
  media: ContentMedia[];
  post?: ContentPost;
  dealLabel?: string | null;
  aiEnabled?: boolean;
}) {
  const isNew = !post;
  const [mediaUrls, setMediaUrls] = useState<string[]>(post?.media_urls ?? []);
  const [platform, setPlatform] = useState(post?.platform ?? 'instagram');
  const [status, setStatus] = useState(post?.status ?? 'idea');
  const [dealId, setDealId] = useState(post?.deal_id ?? '');
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleDraft() {
    setDrafting(true);
    setAiError('');
    const first = mediaUrls[0] ? media.find((m) => m.url === mediaUrls[0]) : undefined;
    const res = await draftCaption({
      talentId,
      mediaUrl: mediaUrls[0] ?? null,
      isVideo: first?.kind === 'video',
      dealId: dealId || null,
    });
    if (res.ok) setCaption(res.caption);
    else setAiError(res.error);
    setDrafting(false);
  }

  const mediaByUrl = (url: string) => media.find((m) => m.url === url);
  const toggleMedia = (url: string) =>
    setMediaUrls((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]));
  const removeMedia = (url: string) => setMediaUrls((cur) => cur.filter((u) => u !== url));
  const tooMany = mediaUrls.length > 10;

  // Schedule = a date + a time. We start with just the date (from scheduled_for,
  // which is timezone-free) so server and first-client render match; once mounted
  // we fill the time (and refine the date) from scheduled_at in the viewer's tz.
  const [date, setDate] = useState(post?.scheduled_for ?? '');
  const [time, setTime] = useState('');
  useEffect(() => {
    if (!post?.scheduled_at) return;
    const d = new Date(post.scheduled_at);
    if (Number.isNaN(d.getTime())) return;
    const p2 = (n: number) => String(n).padStart(2, '0');
    setDate(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`);
    setTime(`${p2(d.getHours())}:${p2(d.getMinutes())}`);
  }, [post?.scheduled_at]);

  // Combine the local date + time into a UTC instant for the scheduler. Building a
  // Date from "YYYY-MM-DDTHH:mm" (no zone) parses in the browser's tz, so toISOString
  // yields the correct UTC — exactly what the cron compares against.
  const scheduledAt = date && time ? new Date(`${date}T${time}`).toISOString() : '';

  const hasMedia = mediaUrls.length > 0 && !tooMany;
  const publishable = platform === 'instagram' || platform === 'tiktok';
  const canPublishIg = !isNew && platform === 'instagram' && hasMedia;
  const canPublishTt = !isNew && platform === 'tiktok' && hasMedia;
  const willAutoPublish = status === 'scheduled' && publishable && Boolean(scheduledAt) && hasMedia;
  const scheduledMissing =
    status === 'scheduled' && (!scheduledAt || !hasMedia || !publishable);

  return (
    <form action={saveContentPost} className="space-y-2 rounded-2xl border border-line bg-white p-4">
      {post && <input type="hidden" name="id" value={post.id} />}
      <input type="hidden" name="talent_id" value={talentId} />
      <input type="hidden" name="media_urls" value={mediaUrls.join('\n')} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <select
          name="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={fieldCls}
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.icon} {p.label}
            </option>
          ))}
        </select>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldCls}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          name="deal_id"
          value={dealId}
          onChange={(e) => setDealId(e.target.value)}
          className={fieldCls}
        >
          <option value="">No deal</option>
          {deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.company_name}
            </option>
          ))}
        </select>
      </div>

      {/* Schedule: a date + time the post should auto-publish. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-stone">🗓 Schedule</span>
        <input
          type="date"
          name="scheduled_for"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`${fieldCls} w-auto`}
        />
        <input
          type="time"
          aria-label="Time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={`${fieldCls} w-auto`}
        />
        <input type="hidden" name="scheduled_at" value={scheduledAt} />
      </div>

      {willAutoPublish && (
        <p className="text-xs text-[#5B8C5A]">
          ✓ Set to <strong>Scheduled</strong> — this will auto-publish to{' '}
          {platform === 'tiktok' ? 'TikTok' : 'Instagram'} at the date &amp; time above.
        </p>
      )}
      {scheduledMissing && (
        <p className="text-xs text-tulip-dark">
          To auto-publish, set status to <strong>Scheduled</strong> on Instagram or TikTok, with a
          date &amp; time and a photo/video attached.
        </p>
      )}
      {post?.status === 'failed' && post?.publish_error && (
        <p className="text-xs text-red-600">
          Last auto-publish failed: {post.publish_error}. Fix it, then set the status back to
          Scheduled to retry.
        </p>
      )}

      <div className="space-y-1">
        <textarea
          name="caption"
          rows={2}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption…"
          className={fieldCls}
        />
        {aiEnabled && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDraft}
              disabled={drafting}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink hover:border-ink disabled:opacity-50"
            >
              {drafting ? 'Drafting…' : caption.trim() ? '✨ Rewrite with AI' : '✨ Draft with AI'}
            </button>
            {mediaUrls[0] && <span className="text-[0.65rem] text-stone">uses your photo + brand</span>}
            {aiError && <span className="text-[0.65rem] text-red-600">{aiError}</span>}
          </div>
        )}
      </div>

      {/* Media — one photo/video, or 2–10 for a carousel (order preserved) */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {mediaUrls.map((url, i) => {
            const m = mediaByUrl(url);
            return (
              <div
                key={url}
                className="relative h-14 w-14 overflow-hidden rounded-lg border border-line bg-blush/40"
              >
                {m?.kind === 'video' ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={url} className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-full w-full object-cover" />
                )}
                <span className="absolute left-0 top-0 rounded-br bg-ink/70 px-1 text-[0.6rem] text-ivory">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeMedia(url)}
                  aria-label="Remove"
                  className="absolute right-0 top-0 rounded-bl bg-ink/70 px-1 text-[0.6rem] text-ivory hover:bg-tulip"
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Add media"
            className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-line text-xl text-sage hover:border-ink hover:text-ink"
          >
            +
          </button>
        </div>
        <p className="text-xs text-stone">
          {mediaUrls.length === 0
            ? 'Add a photo or video — pick 2–10 to post a carousel.'
            : mediaUrls.length === 1
              ? '1 item · single post'
              : `${mediaUrls.length} items · carousel`}
        </p>
        {tooMany && (
          <p className="text-xs text-red-600">
            Instagram carousels allow up to 10 items — remove {mediaUrls.length - 10}.
          </p>
        )}
      </div>

      {pickerOpen && (
        <div className="rounded-xl border border-line bg-ivory p-2">
          {media.length === 0 ? (
            <p className="p-2 text-xs text-stone">No media yet — upload some in your library first.</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between px-1 text-xs text-stone">
                <span>Tap to add or remove · {mediaUrls.length} selected</span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  className="rounded-full border border-line px-2 py-0.5 hover:border-ink"
                >
                  Done
                </button>
              </div>
              <div className="grid max-h-40 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {media.map((m) => {
                  const idx = mediaUrls.indexOf(m.url);
                  const picked = idx !== -1;
                  return (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => toggleMedia(m.url)}
                      className={
                        'relative aspect-square overflow-hidden rounded-md border ' +
                        (picked ? 'border-ink ring-2 ring-tulip' : 'border-line hover:border-ink')
                      }
                    >
                      {m.kind === 'video' ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video src={m.url} className="h-full w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      )}
                      {picked && (
                        <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-tulip text-[0.6rem] text-ivory">
                          {idx + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button className="rounded-full bg-ink px-5 py-2 text-sm text-ivory transition-colors hover:bg-tulip">
          {isNew ? 'Add post' : 'Save'}
        </button>
        <div className="flex items-center gap-3">
          {dealLabel && <span className="text-xs text-stone">for {dealLabel}</span>}
          {canPublishIg && (
            <button
              formAction={publishContentPost}
              className="rounded-full bg-tulip px-4 py-1.5 text-xs font-medium text-ivory transition-colors hover:bg-tulip-dark"
            >
              Publish to Instagram
            </button>
          )}
          {canPublishTt && (
            <button
              formAction={publishContentPost}
              className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-ivory transition-colors hover:bg-tulip"
            >
              Publish to TikTok
            </button>
          )}
          {post && (
            <button
              formAction={deleteContentPost}
              className="text-xs text-stone underline-offset-2 hover:text-tulip hover:underline"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
