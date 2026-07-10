import type { SupabaseClient } from '@supabase/supabase-js';
import { publishToInstagram, refreshInstagramToken } from '@/lib/integrations/instagram';
import { publishToTikTok, refreshTikTokToken } from '@/lib/integrations/tiktok';

// Refresh a stored token if it's within this window of expiring, so a post
// scheduled out into the future doesn't fail on a token that quietly lapsed.
const REFRESH_WINDOW_MS = 10 * 24 * 3600 * 1000;

export type PublishOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'no_post' | 'unsupported' | 'no_media' | 'not_connected' | 'processing' | 'failed';
      error?: string;
    };

interface Post {
  talent_id: string;
  caption: string | null;
  media_urls: string[];
  platform: string;
}
type MediaItem = { url: string; isVideo: boolean };

async function markPosted(supabase: SupabaseClient, id: string) {
  await supabase
    .from('content_posts')
    .update({ status: 'posted', published_at: new Date().toISOString(), publish_error: null })
    .eq('id', id);
}

// Core publish logic shared by the manual "Publish" button (a server action) and
// the scheduled-publish cron. It takes any Supabase client: the action passes the
// request-scoped client (RLS runs as the creator), while the cron passes the
// service-role client so it can publish on behalf of any creator without a user
// session. On success it flips the post to `posted`; it never redirects.
export async function publishPostById(
  supabase: SupabaseClient,
  id: string,
): Promise<PublishOutcome> {
  const { data: postRow } = await supabase
    .from('content_posts')
    .select('talent_id, caption, media_urls, platform')
    .eq('id', id)
    .maybeSingle();
  const post = postRow as Post | null;
  if (!post) return { ok: false, reason: 'no_post' };

  const urls = post.media_urls ?? [];
  if (urls.length === 0) return { ok: false, reason: 'no_media' };

  // Per-item photo vs video: prefer the library's recorded kind, fall back to the
  // file extension. Order is preserved (carousel / photo order).
  const { data: mediaRows } = await supabase
    .from('content_media')
    .select('url, kind')
    .in('url', urls);
  const kindByUrl = new Map(
    ((mediaRows as { url: string; kind: string }[] | null) ?? []).map((m) => [m.url, m.kind]),
  );
  const media: MediaItem[] = urls.map((url) => ({
    url,
    isVideo: kindByUrl.get(url) === 'video' || /\.(mp4|mov|m4v)$/i.test(url),
  }));

  if (post.platform === 'instagram') return publishInstagram(supabase, id, post, media);
  if (post.platform === 'tiktok') return publishTikTok(supabase, id, post, media);
  return { ok: false, reason: 'unsupported' };
}

async function publishInstagram(
  supabase: SupabaseClient,
  id: string,
  post: Post,
  media: MediaItem[],
): Promise<PublishOutcome> {
  const { data: connRow } = await supabase
    .from('instagram_connections')
    .select('ig_user_id, access_token, token_expiry')
    .eq('talent_id', post.talent_id)
    .maybeSingle();
  const conn = connRow as
    | { ig_user_id: string | null; access_token: string | null; token_expiry: string | null }
    | null;
  if (!conn?.ig_user_id || !conn.access_token) return { ok: false, reason: 'not_connected' };

  // Refresh a near-expiry token, then publish with the fresh one.
  let token = conn.access_token;
  if (conn.token_expiry && new Date(conn.token_expiry).getTime() - Date.now() < REFRESH_WINDOW_MS) {
    const refreshed = await refreshInstagramToken(token);
    if (refreshed) {
      token = refreshed.token;
      await supabase
        .from('instagram_connections')
        .update({
          access_token: refreshed.token,
          token_expiry: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('talent_id', post.talent_id);
    }
  }

  const result = await publishToInstagram({
    igUserId: conn.ig_user_id,
    pageToken: token,
    media,
    caption: post.caption ?? '',
  });
  if (result.ok) {
    await markPosted(supabase, id);
    return { ok: true };
  }
  return { ok: false, reason: result.processing ? 'processing' : 'failed', error: result.error };
}

async function publishTikTok(
  supabase: SupabaseClient,
  id: string,
  post: Post,
  media: MediaItem[],
): Promise<PublishOutcome> {
  const { data: connRow } = await supabase
    .from('tiktok_connections')
    .select('access_token, refresh_token, token_expiry')
    .eq('talent_id', post.talent_id)
    .maybeSingle();
  const conn = connRow as
    | { access_token: string | null; refresh_token: string | null; token_expiry: string | null }
    | null;
  if (!conn?.access_token) return { ok: false, reason: 'not_connected' };

  // TikTok access tokens live only ~24h, so refresh whenever we're inside the
  // window (which, for TikTok, is essentially always) and a refresh token exists.
  let token = conn.access_token;
  const nearExpiry =
    !conn.token_expiry || new Date(conn.token_expiry).getTime() - Date.now() < REFRESH_WINDOW_MS;
  if (nearExpiry && conn.refresh_token) {
    const refreshed = await refreshTikTokToken(conn.refresh_token);
    if (refreshed) {
      token = refreshed.accessToken;
      const now = Date.now();
      await supabase
        .from('tiktok_connections')
        .update({
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken,
          token_expiry: new Date(now + refreshed.expiresIn * 1000).toISOString(),
          refresh_expiry: new Date(now + refreshed.refreshExpiresIn * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('talent_id', post.talent_id);
    }
  }

  const result = await publishToTikTok({ accessToken: token, media, caption: post.caption ?? '' });
  if (result.ok) {
    await markPosted(supabase, id);
    return { ok: true };
  }
  return { ok: false, reason: 'failed', error: result.error };
}
