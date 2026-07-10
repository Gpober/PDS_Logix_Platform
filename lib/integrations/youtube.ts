// YouTube live stats via the public YouTube Data API v3. Needs only a free API
// key (YOUTUBE_API_KEY) — no OAuth, no app review — because subscriber/view
// counts for public channels are public data.

const API = 'https://www.googleapis.com/youtube/v3/channels';

export type YouTubeResult =
  | { ok: true; subscribers: number }
  | { ok: false; reason: 'no_key' | 'unresolved' | 'api_error' | 'not_found' | 'hidden'; detail?: string };

type Resolved = { param: 'id' | 'forHandle' | 'forUsername'; value: string };

// Figure out how to look the channel up from whatever the creator entered.
function resolve(handle: string | null, url: string | null): Resolved | null {
  const u = (url ?? '').trim();

  const channelId = u.match(/\/channel\/(UC[\w-]+)/i)?.[1];
  if (channelId) return { param: 'id', value: channelId };

  const urlHandle = u.match(/\/@([\w.\-]+)/)?.[1];
  if (urlHandle) return { param: 'forHandle', value: urlHandle };

  const legacyUser = u.match(/\/user\/([\w.\-]+)/i)?.[1];
  if (legacyUser) return { param: 'forUsername', value: legacyUser };

  const h = (handle ?? '').trim().replace(/^@/, '');
  if (h) return { param: 'forHandle', value: h };

  return null;
}

export async function fetchYouTube(
  handle: string | null,
  url: string | null,
): Promise<YouTubeResult> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { ok: false, reason: 'no_key' };

  const target = resolve(handle, url);
  if (!target) return { ok: false, reason: 'unresolved' };

  const params = new URLSearchParams({ part: 'statistics', key });
  params.set(target.param, target.value);

  try {
    const res = await fetch(`${API}?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, reason: 'api_error', detail: `${res.status} ${body.slice(0, 160)}` };
    }
    const json = (await res.json()) as {
      items?: { statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[];
    };
    const stats = json.items?.[0]?.statistics;
    if (!stats) return { ok: false, reason: 'not_found' };
    if (stats.hiddenSubscriberCount) return { ok: false, reason: 'hidden' };
    const n = Number(stats.subscriberCount);
    if (!Number.isFinite(n)) return { ok: false, reason: 'not_found' };
    return { ok: true, subscribers: n };
  } catch (e) {
    return { ok: false, reason: 'api_error', detail: e instanceof Error ? e.message : 'fetch failed' };
  }
}

export const youtubeConfigured = (): boolean => Boolean(process.env.YOUTUBE_API_KEY);
