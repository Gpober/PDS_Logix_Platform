// Standalone Google OAuth for "Connect YouTube" — independent of the creator's
// portal login, so they can authorize whichever Google account owns their
// channel. Reuses the app's existing GOOGLE_CLIENT_ID/SECRET (add the redirect
// URI + youtube.readonly scope to that OAuth client in Google Cloud Console).

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

export const youtubeOAuthConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// The OAuth callback URL. Pinned to the canonical site (via NEXT_PUBLIC_SITE_URL
// or CANONICAL_HOST) so it's a stable, exact string to register in Google —
// never a shifting preview host. Falls back to the current request origin.
export function youtubeRedirectUri(reqUrl: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.CANONICAL_HOST ? `https://${process.env.CANONICAL_HOST}` : null);
  if (base) return `${base.replace(/\/$/, '')}/api/youtube/callback`;
  return new URL('/api/youtube/callback', reqUrl).toString();
}

export function youtubeAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent', // force a refresh_token even on re-connect
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export interface YouTubeTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string,
): Promise<YouTubeTokens | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!j.access_token) return null;
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? null,
      expiresIn: j.expires_in ?? 3600,
    };
  } catch {
    return null;
  }
}

export async function refreshYouTubeToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
  } catch {
    return null;
  }
}

export interface YouTubeChannel {
  channelId: string;
  title: string;
  subscribers: number | null; // null if the channel hides its count
}

// The channel owned by the authorized account (mine=true) — no handle needed.
export async function fetchMyYouTubeChannel(accessToken: string): Promise<YouTubeChannel | null> {
  try {
    const params = new URLSearchParams({ part: 'snippet,statistics', mine: 'true' });
    const res = await fetch(`${CHANNELS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      items?: {
        id?: string;
        snippet?: { title?: string };
        statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
      }[];
    };
    const item = j.items?.[0];
    if (!item?.id) return null;
    const hidden = item.statistics?.hiddenSubscriberCount;
    const subs = hidden ? null : Number(item.statistics?.subscriberCount);
    return {
      channelId: item.id,
      title: item.snippet?.title ?? 'YouTube',
      subscribers: subs != null && Number.isFinite(subs) ? subs : null,
    };
  } catch {
    return null;
  }
}
