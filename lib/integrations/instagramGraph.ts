// Instagram via **Facebook Login** (the Instagram Graph API). Unlike the
// Instagram-login flow in instagram.ts (publishing only), this path — a Facebook
// Page linked to an IG Business account — supports Business Discovery (followers,
// posts) and Insights (reach, audience demographics). Server-side only.
//
// Env:
//   FB_APP_ID          — Facebook app id (Talent Board)
//   FB_APP_SECRET      — Facebook app secret
//   FB_LOGIN_CONFIG_ID — Facebook Login for Business configuration id
//   FB_DISCOVERY_IG_ID / FB_DISCOVERY_TOKEN (optional) — a dedicated agency
//     IG business id + Page token for looking up creators who haven't connected.

const GRAPH = 'https://graph.facebook.com';
const VER = 'v21.0';
const DIALOG = 'https://www.facebook.com';

export function instagramGraphConfigured(): boolean {
  return Boolean(process.env.FB_APP_ID && process.env.FB_APP_SECRET && process.env.FB_LOGIN_CONFIG_ID);
}

export function instagramGraphRedirectUri(reqUrl: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.CANONICAL_HOST ? `https://${process.env.CANONICAL_HOST}` : null);
  if (base) return `${base.replace(/\/$/, '')}/api/instagram-fb/callback`;
  return new URL('/api/instagram-fb/callback', reqUrl).toString();
}

// Facebook Login for Business dialog URL (uses the saved configuration).
export function instagramGraphAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.FB_APP_ID ?? '',
    config_id: process.env.FB_LOGIN_CONFIG_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  return `${DIALOG}/${VER}/dialog/oauth?${p.toString()}`;
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

export interface GraphLink {
  igBusinessId: string;
  igUsername: string | null;
  pageId: string | null;
  pageToken: string;
  userToken: string;
  expiresIn: number;
}

// Exchange the OAuth code → short-lived user token → long-lived user token →
// the user's Page + its linked IG Business account + Page token.
export async function resolveInstagramGraph(
  code: string,
  redirectUri: string,
): Promise<GraphLink | null> {
  const id = process.env.FB_APP_ID;
  const secret = process.env.FB_APP_SECRET;
  if (!id || !secret) return null;

  const tokenJson = await getJson(
    `${GRAPH}/${VER}/oauth/access_token?client_id=${id}&client_secret=${secret}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
  );
  const shortToken = tokenJson?.access_token as string | undefined;
  if (!shortToken) return null;

  // Upgrade to a long-lived user token (~60 days).
  const longJson = await getJson(
    `${GRAPH}/${VER}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${id}&client_secret=${secret}&fb_exchange_token=${shortToken}`,
  );
  const userToken = (longJson?.access_token as string | undefined) ?? shortToken;
  const expiresIn = (longJson?.expires_in as number | undefined) ?? 60 * 24 * 3600;

  // The Page + its linked IG Business account (Page token doesn't expire when
  // derived from a long-lived user token).
  const pagesJson = await getJson(
    `${GRAPH}/${VER}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}` +
      `&access_token=${userToken}`,
  );
  const pages = (pagesJson?.data as Record<string, unknown>[] | undefined) ?? [];
  const withIg = pages.find((p) => p.instagram_business_account);
  if (!withIg) return null;
  const iba = withIg.instagram_business_account as { id: string; username?: string };

  return {
    igBusinessId: iba.id,
    igUsername: iba.username ?? null,
    pageId: (withIg.id as string) ?? null,
    pageToken: (withIg.access_token as string) ?? userToken,
    userToken,
    expiresIn,
  };
}

// ---- Stats (graph.facebook.com) ---------------------------------------------

import type { IgProfile, IgInsights } from '@/lib/integrations/instagram';

// Business Discovery via the Facebook-login path: {ig-business-id}?fields=
// business_discovery.username(TARGET){...}. Works for any public Business/Creator.
export async function fetchProfileGraph(
  igBusinessId: string,
  token: string,
  username: string,
): Promise<IgProfile | null> {
  const uname = username.replace(/^@/, '').trim();
  if (!uname) return null;
  const media =
    'media.limit(12){media_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp}';
  const fields = `business_discovery.username(${uname}){username,name,biography,followers_count,media_count,profile_picture_url,${media}}`;
  const json = await getJson(
    `${GRAPH}/${VER}/${igBusinessId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`,
  );
  const bd = json?.business_discovery as Record<string, unknown> | undefined;
  if (!bd) return null;

  const followers = typeof bd.followers_count === 'number' ? bd.followers_count : null;
  const posts = (((bd.media as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[]).map(
    (m) => ({
      permalink: (m.permalink as string) ?? '',
      mediaUrl: (m.media_url as string) ?? (m.thumbnail_url as string) ?? null,
      mediaType: (m.media_type as string) ?? null,
      likeCount: typeof m.like_count === 'number' ? m.like_count : 0,
      commentsCount: typeof m.comments_count === 'number' ? m.comments_count : 0,
      timestamp: (m.timestamp as string) ?? null,
    }),
  );
  const n = posts.length;
  const avgLikes = n ? Math.round(posts.reduce((s, p) => s + p.likeCount, 0) / n) : null;
  const avgComments = n ? Math.round(posts.reduce((s, p) => s + p.commentsCount, 0) / n) : null;
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
    recentPosts: posts,
  };
}

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

// Insights for the creator's OWN connected account (Page-linked): reach +
// audience demographics. Returns nulls until instagram_manage_insights is granted.
export async function fetchInsightsGraph(igBusinessId: string, token: string): Promise<IgInsights> {
  const out: IgInsights = {
    reach: null,
    views: null,
    audienceGender: null,
    audienceAge: null,
    audienceCountry: null,
  };
  const base = `${GRAPH}/${VER}/${igBusinessId}/insights`;
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
