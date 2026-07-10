// Instagram Content Publishing via **Instagram Business Login** (the newer flow —
// no Facebook Page required; creators authorize their IG Professional account
// directly). Uses the dedicated Instagram App ID/Secret and graph.instagram.com.

const AUTHORIZE = 'https://www.instagram.com/oauth/authorize';
const TOKEN = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';
const VER = 'v21.0';
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  // Insights (reach, views, audience demographics). Meta only grants this after
  // App Review; requesting it early is harmless — it's ignored until approved.
  'instagram_business_manage_insights',
];

export const instagramConfigured = (): boolean =>
  Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);

export function instagramRedirectUri(reqUrl: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.CANONICAL_HOST ? `https://${process.env.CANONICAL_HOST}` : null);
  if (base) return `${base.replace(/\/$/, '')}/api/instagram/callback`;
  return new URL('/api/instagram/callback', reqUrl).toString();
}

export function instagramAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(','),
    state,
  });
  return `${AUTHORIZE}?${p.toString()}`;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface InstagramLink {
  igUserId: string;
  username: string | null;
  pageId: string | null;
  pageToken: string; // long-lived Instagram user access token
  expiresIn: number;
}

// Exchange the OAuth code for a short-lived token, upgrade to long-lived, and
// read the account's id + username.
export async function resolveInstagram(
  code: string,
  redirectUri: string,
): Promise<InstagramLink | null> {
  const appId = process.env.INSTAGRAM_APP_ID ?? '';
  const secret = process.env.INSTAGRAM_APP_SECRET ?? '';

  // 1. code -> short-lived token (+ user_id)
  let shortToken: string | undefined;
  try {
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: secret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; user_id?: string | number };
    shortToken = j.access_token;
  } catch {
    return null;
  }
  if (!shortToken) return null;

  // 2. short -> long-lived token (~60 days)
  const long = await getJson(
    `${GRAPH}/access_token?grant_type=ig_exchange_token&client_secret=${secret}&access_token=${shortToken}`,
  );
  const longToken = (long?.access_token as string | undefined) ?? shortToken;
  const expiresIn = (long?.expires_in as number | undefined) ?? 60 * 24 * 3600;

  // 3. account id + username
  const me = await getJson(`${GRAPH}/${VER}/me?fields=user_id,username&access_token=${longToken}`);
  const igUserId = me?.user_id ? String(me.user_id) : null;
  if (!igUserId) return null;

  return {
    igUserId,
    username: (me?.username as string | undefined) ?? null,
    pageId: null,
    pageToken: longToken,
    expiresIn,
  };
}

// Refresh a long-lived Instagram user token. IG long-lived tokens last ~60 days
// and can be refreshed once they're >24h old (and not yet expired), which resets
// the 60-day clock. Returns the fresh token + its new lifetime, or null.
export async function refreshInstagramToken(
  token: string,
): Promise<{ token: string; expiresIn: number } | null> {
  const j = await getJson(
    `${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`,
  );
  const fresh = j?.access_token as string | undefined;
  if (!fresh) return null;
  return { token: fresh, expiresIn: (j?.expires_in as number | undefined) ?? 60 * 24 * 3600 };
}

// ---- Media-kit stats --------------------------------------------------------

export interface IgRecentPost {
  permalink: string;
  mediaUrl: string | null;
  mediaType: string | null;
  likeCount: number;
  commentsCount: number;
  timestamp: string | null;
}

export interface IgProfile {
  username: string | null;
  name: string | null;
  bio: string | null;
  profilePic: string | null;
  followers: number | null;
  mediaCount: number | null;
  avgPostLikes: number | null;
  avgPostComments: number | null;
  engagementRate: number | null; // percent, e.g. 5.93
  recentPosts: IgRecentPost[];
}

// Tier 1 — public Business Discovery: look up any Business/Creator account by
// username (using a connected professional account's token) and return their
// followers, post count, recent posts, and a computed engagement rate. This is
// how media-kit tools auto-fill follower counts.
export async function fetchInstagramProfile(
  igUserId: string,
  token: string,
  username: string,
): Promise<IgProfile | null> {
  const uname = username.replace(/^@/, '').trim();
  if (!uname) return null;
  const media =
    'media.limit(12){media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp}';
  const fields = `business_discovery.username(${uname}){username,name,biography,followers_count,media_count,profile_picture_url,${media}}`;
  const url = `${GRAPH}/${VER}/${igUserId}?fields=${encodeURIComponent(
    fields,
  )}&access_token=${encodeURIComponent(token)}`;
  const json = await getJson(url);
  const bd = json?.business_discovery as Record<string, unknown> | undefined;
  if (!bd) return null;

  const followers = typeof bd.followers_count === 'number' ? bd.followers_count : null;
  const mediaData = (((bd.media as { data?: unknown[] } | undefined)?.data ?? []) as Record<
    string,
    unknown
  >[]).map((m) => ({
    permalink: (m.permalink as string) ?? '',
    mediaUrl: (m.media_url as string) ?? (m.thumbnail_url as string) ?? null,
    mediaType: (m.media_type as string) ?? null,
    likeCount: typeof m.like_count === 'number' ? m.like_count : 0,
    commentsCount: typeof m.comments_count === 'number' ? m.comments_count : 0,
    timestamp: (m.timestamp as string) ?? null,
  }));
  const n = mediaData.length;
  const avgLikes = n ? Math.round(mediaData.reduce((s, p) => s + p.likeCount, 0) / n) : null;
  const avgComments = n ? Math.round(mediaData.reduce((s, p) => s + p.commentsCount, 0) / n) : null;
  const engagementRate =
    followers && followers > 0 && avgLikes != null && avgComments != null
      ? Math.round(((avgLikes + avgComments) / followers) * 10000) / 100
      : null;

  return {
    username: (bd.username as string) ?? uname,
    name: (bd.name as string) ?? null,
    bio: (bd.biography as string) ?? null,
    profilePic: (bd.profile_picture_url as string) ?? null,
    followers,
    mediaCount: typeof bd.media_count === 'number' ? bd.media_count : null,
    avgPostLikes: avgLikes,
    avgPostComments: avgComments,
    engagementRate,
    recentPosts: mediaData,
  };
}

export interface IgInsights {
  reach: number | null;
  views: number | null;
  audienceGender: Record<string, number> | null;
  audienceAge: Record<string, number> | null;
  audienceCountry: Record<string, number> | null;
}

// Parse a follower_demographics insights response into a {label: value} map for
// one breakdown dimension (age, gender, or country).
function parseDemographics(json: Record<string, unknown> | null): Record<string, number> | null {
  const entry = (json?.data as Record<string, unknown>[] | undefined)?.[0];
  const total = entry?.total_value as { breakdowns?: Record<string, unknown>[] } | undefined;
  const results = total?.breakdowns?.[0]?.results as
    | { dimension_values?: string[]; value?: number }[]
    | undefined;
  if (!results?.length) return null;
  const out: Record<string, number> = {};
  for (const r of results) {
    const key = r.dimension_values?.join(' · ');
    if (key && typeof r.value === 'number') out[key] = r.value;
  }
  return Object.keys(out).length ? out : null;
}

// Tier 2 — Instagram Insights for the creator's OWN connected account: reach and
// audience demographics. Returns nulls until instagram_business_manage_insights
// is approved and granted, so callers can persist whatever is available.
export async function fetchInstagramInsights(
  igUserId: string,
  token: string,
): Promise<IgInsights> {
  const out: IgInsights = {
    reach: null,
    views: null,
    audienceGender: null,
    audienceAge: null,
    audienceCountry: null,
  };
  const base = `${GRAPH}/${VER}/${igUserId}/insights`;
  const auth = `access_token=${encodeURIComponent(token)}`;

  const reachJson = await getJson(`${base}?metric=reach&period=days_28&metric_type=total_value&${auth}`);
  const reachVal = (reachJson?.data as Record<string, unknown>[] | undefined)?.[0]?.total_value as
    | { value?: number }
    | undefined;
  if (typeof reachVal?.value === 'number') out.reach = reachVal.value;

  const demo = (breakdown: string) =>
    getJson(
      `${base}?metric=follower_demographics&period=lifetime&timeframe=this_month&breakdown=${breakdown}&metric_type=total_value&${auth}`,
    );
  out.audienceAge = parseDemographics(await demo('age'));
  out.audienceGender = parseDemographics(await demo('gender'));
  out.audienceCountry = parseDemographics(await demo('country'));

  return out;
}

export type PublishResult =
  | { ok: true; mediaId: string }
  | { ok: false; error: string; processing?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForContainer(
  containerId: string,
  token: string,
): Promise<{ ready: boolean; error?: string }> {
  for (let i = 0; i < 8; i++) {
    const j = await getJson(
      `${GRAPH}/${VER}/${containerId}?fields=status_code,status&access_token=${token}`,
    );
    const status = j?.status_code as string | undefined;
    if (status === 'FINISHED') return { ready: true };
    if (status === 'ERROR' || status === 'EXPIRED') {
      return { ready: false, error: (j?.status as string) ?? 'Video processing failed.' };
    }
    await sleep(3000);
  }
  return { ready: false };
}

export interface MediaItem {
  url: string;
  isVideo: boolean;
}

// POST a media container; returns its id or an error message.
async function createContainer(
  igUserId: string,
  token: string,
  body: Record<string, string | boolean>,
): Promise<{ id?: string; error?: string }> {
  const res = await fetch(`${GRAPH}/${VER}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
    cache: 'no-store',
  });
  const j = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !j.id) return { error: j.error?.message ?? 'Could not create the post.' };
  return { id: j.id };
}

async function publishContainer(
  igUserId: string,
  creationId: string,
  token: string,
): Promise<PublishResult> {
  const res = await fetch(`${GRAPH}/${VER}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: token }),
    cache: 'no-store',
  });
  const j = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !j.id) return { ok: false, error: j.error?.message ?? 'Could not publish the post.' };
  return { ok: true, mediaId: j.id };
}

// Publish one or more media to Instagram. A single item posts as a photo or Reel;
// 2–10 items post as a carousel. Photos post immediately; videos encode
// asynchronously, so we poll each container before publishing.
export async function publishToInstagram(params: {
  igUserId: string;
  pageToken: string; // the stored long-lived IG token
  media: MediaItem[];
  caption: string;
}): Promise<PublishResult> {
  const { igUserId, pageToken, media, caption } = params;
  try {
    if (media.length === 0) return { ok: false, error: 'Add a photo or video before publishing.' };
    if (media.length > 10) return { ok: false, error: 'Instagram carousels allow up to 10 items.' };

    // Single post — photo or Reel.
    if (media.length === 1) {
      const item = media[0];
      const c = await createContainer(
        igUserId,
        pageToken,
        item.isVideo
          ? { media_type: 'REELS', video_url: item.url, caption }
          : { image_url: item.url, caption },
      );
      if (!c.id) return { ok: false, error: c.error! };
      if (item.isVideo) {
        const status = await waitForContainer(c.id, pageToken);
        if (!status.ready) {
          return {
            ok: false,
            processing: !status.error,
            error: status.error ?? 'Video is still processing — hit Publish again in a minute.',
          };
        }
      }
      return publishContainer(igUserId, c.id, pageToken);
    }

    // Carousel — a child container per item, then a parent that ties them together.
    const childIds: string[] = [];
    for (const item of media) {
      const c = await createContainer(
        igUserId,
        pageToken,
        item.isVideo
          ? { media_type: 'VIDEO', video_url: item.url, is_carousel_item: true }
          : { image_url: item.url, is_carousel_item: true },
      );
      if (!c.id) return { ok: false, error: c.error! };
      if (item.isVideo) {
        const status = await waitForContainer(c.id, pageToken);
        if (!status.ready) {
          return {
            ok: false,
            processing: !status.error,
            error: status.error ?? 'A carousel video is still processing — hit Publish again in a minute.',
          };
        }
      }
      childIds.push(c.id);
    }

    const parent = await createContainer(igUserId, pageToken, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
    });
    if (!parent.id) return { ok: false, error: parent.error! };
    return publishContainer(igUserId, parent.id, pageToken);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Publish failed.' };
  }
}
