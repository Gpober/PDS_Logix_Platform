// TikTok Content Posting API (Direct Post) via Login Kit v2. Creators authorize
// their own TikTok account; we direct-post videos and photos by URL. Server-only:
// the client secret and tokens never reach the browser.
//
// Notes on TikTok's rules that shape this code:
//  • Access tokens expire in ~24h; refresh tokens last ~365 days. Always refresh
//    before publishing (see lib/crm/publish.ts).
//  • Publishing by URL (PULL_FROM_URL) requires the video/photo host domain to be
//    verified in the TikTok app (URL properties).
//  • Until the app passes TikTok's audit, posts can only be SELF_ONLY (private).
//    We query creator_info and pick the best allowed privacy level, so it upgrades
//    to public automatically once the audit clears.

const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const API = 'https://open.tiktokapis.com/v2';
// video.publish (Direct Post) is only granted after TikTok's app audit — it's not
// available in the sandbox. So we request it only once TIKTOK_ENABLE_PUBLISH is
// set; before that we request login-only so creators can still connect (and we
// store their token) while the audit is pending. Flip the flag on once approved.
function publishEnabled(): boolean {
  const v = (process.env.TIKTOK_ENABLE_PUBLISH ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
function requestedScopes(): string[] {
  return publishEnabled() ? ['user.info.basic', 'video.publish'] : ['user.info.basic'];
}

// Sandbox vs production credentials. Set TIKTOK_SANDBOX=true to test against the
// sandbox app (with its own client key/secret) while the production app is under
// review; flip it back (or unset) to go live. The API endpoints are the same —
// only the credentials differ.
function tiktokSandbox(): boolean {
  const v = (process.env.TIKTOK_SANDBOX ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
function clientKey(): string {
  return (tiktokSandbox() ? process.env.TIKTOK_CLIENT_KEY_SB : process.env.TIKTOK_CLIENT_KEY) ?? '';
}
function clientSecret(): string {
  return (
    (tiktokSandbox() ? process.env.TIKTOK_CLIENT_SECRET_SB : process.env.TIKTOK_CLIENT_SECRET) ?? ''
  );
}

export const tiktokConfigured = (): boolean => Boolean(clientKey() && clientSecret());

export function tiktokRedirectUri(reqUrl: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.CANONICAL_HOST ? `https://${process.env.CANONICAL_HOST}` : null);
  if (base) return `${base.replace(/\/$/, '')}/api/tiktok/callback`;
  return new URL('/api/tiktok/callback', reqUrl).toString();
}

export function tiktokAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_key: clientKey(),
    scope: requestedScopes().join(','),
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTHORIZE}?${p.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse | null> {
  try {
    const res = await fetch(TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(body),
      cache: 'no-store',
    });
    const j = (await res.json()) as TokenResponse;
    if (!res.ok || !j.access_token) return null;
    return j;
  } catch {
    return null;
  }
}

export interface TikTokLink {
  openId: string;
  username: string | null;
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  expiresIn: number; // access token lifetime (s)
  refreshExpiresIn: number; // refresh token lifetime (s)
}

// Exchange the OAuth code for tokens, then read the display name.
export async function resolveTikTok(code: string, redirectUri: string): Promise<TikTokLink | null> {
  const j = await tokenRequest({
    client_key: clientKey(),
    client_secret: clientSecret(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  if (!j?.access_token || !j.open_id) return null;

  const username = await fetchTikTokUsername(j.access_token);
  return {
    openId: j.open_id,
    username,
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    scope: j.scope ?? null,
    expiresIn: j.expires_in ?? 24 * 3600,
    refreshExpiresIn: j.refresh_expires_in ?? 365 * 24 * 3600,
  };
}

export async function refreshTikTokToken(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number; refreshExpiresIn: number } | null> {
  const j = await tokenRequest({
    client_key: clientKey(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  if (!j?.access_token) return null;
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? refreshToken,
    expiresIn: j.expires_in ?? 24 * 3600,
    refreshExpiresIn: j.refresh_expires_in ?? 365 * 24 * 3600,
  };
}

async function fetchTikTokUsername(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/user/info/?fields=open_id,display_name`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { user?: { display_name?: string } } };
    return j.data?.user?.display_name ?? null;
  } catch {
    return null;
  }
}

// Ask TikTok which privacy levels this creator+app may use. Pre-audit the only
// option is SELF_ONLY; post-audit PUBLIC_TO_EVERYONE appears. We prefer public.
async function pickPrivacyLevel(token: string): Promise<string> {
  try {
    const res = await fetch(`${API}/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const j = (await res.json()) as { data?: { privacy_level_options?: string[] } };
    const opts = j.data?.privacy_level_options ?? [];
    if (opts.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
    if (opts.length > 0) return opts[0];
  } catch {
    /* fall through */
  }
  return 'SELF_ONLY';
}

export type TikTokResult = { ok: true; publishId: string } | { ok: false; error: string };

// Direct-post a video or a photo carousel. TikTok processes asynchronously and
// returns a publish_id; a successful init means it was accepted for processing.
export async function publishToTikTok(params: {
  accessToken: string;
  media: { url: string; isVideo: boolean }[];
  caption: string;
}): Promise<TikTokResult> {
  const { accessToken, media, caption } = params;
  if (media.length === 0) return { ok: false, error: 'Add a video or photo before publishing.' };

  const privacy = await pickPrivacyLevel(accessToken);
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const isVideo = media[0].isVideo;

  try {
    const endpoint = isVideo
      ? `${API}/post/publish/video/init/`
      : `${API}/post/publish/content/init/`;

    const body = isVideo
      ? {
          post_info: {
            title: caption,
            privacy_level: privacy,
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: { source: 'PULL_FROM_URL', video_url: media[0].url },
        }
      : {
          post_info: { title: caption, privacy_level: privacy },
          source_info: {
            source: 'PULL_FROM_URL',
            photo_cover_index: 0,
            photo_images: media.map((m) => m.url),
          },
          post_mode: 'DIRECT_POST',
          media_type: 'PHOTO',
        };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const j = (await res.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };
    const publishId = j.data?.publish_id;
    if (!res.ok || !publishId || (j.error && j.error.code && j.error.code !== 'ok')) {
      return { ok: false, error: j.error?.message ?? 'TikTok rejected the post.' };
    }
    return { ok: true, publishId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'TikTok publish failed.' };
  }
}
