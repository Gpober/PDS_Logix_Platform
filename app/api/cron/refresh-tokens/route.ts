import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { refreshInstagramToken } from '@/lib/integrations/instagram';
import { refreshTikTokToken } from '@/lib/integrations/tiktok';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Refresh any connection expiring within this window, so a creator who hasn't
// published in a while still has a live token when their scheduled post fires.
const WINDOW_MS = 20 * 24 * 3600 * 1000;

// GET /api/cron/refresh-tokens — daily proactive refresh of soon-to-expire IG
// tokens. Same CRON_SECRET auth + service-role client as the publish cron.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url).searchParams.get('secret') ??
    '';
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) return NextResponse.json({ error: 'service_role_not_configured' }, { status: 503 });

  const cutoff = new Date(Date.now() + WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from('instagram_connections')
    .select('talent_id, access_token, token_expiry')
    .not('access_token', 'is', null)
    .lte('token_expiry', cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conns = (data as { talent_id: string; access_token: string; token_expiry: string }[]) ?? [];
  let refreshed = 0;
  for (const c of conns) {
    const r = await refreshInstagramToken(c.access_token);
    if (!r) continue;
    await supabase
      .from('instagram_connections')
      .update({
        access_token: r.token,
        token_expiry: new Date(Date.now() + r.expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('talent_id', c.talent_id);
    refreshed += 1;
  }

  // TikTok access tokens expire every ~24h, so refresh every connection that has
  // a refresh token — the WINDOW check would match them all anyway.
  const { data: ttData } = await supabase
    .from('tiktok_connections')
    .select('talent_id, refresh_token')
    .not('refresh_token', 'is', null);
  const ttConns = (ttData as { talent_id: string; refresh_token: string }[]) ?? [];
  let ttRefreshed = 0;
  for (const c of ttConns) {
    const r = await refreshTikTokToken(c.refresh_token);
    if (!r) continue;
    const now = Date.now();
    await supabase
      .from('tiktok_connections')
      .update({
        access_token: r.accessToken,
        refresh_token: r.refreshToken,
        token_expiry: new Date(now + r.expiresIn * 1000).toISOString(),
        refresh_expiry: new Date(now + r.refreshExpiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('talent_id', c.talent_id);
    ttRefreshed += 1;
  }

  // Daily follower snapshot — copy each account's current follower count into
  // follower_snapshots so the analytics tab can chart growth over time. Upsert on
  // (account_id, captured_on) so a same-day re-run overwrites rather than dupes.
  let snapshots = 0;
  const today = new Date().toISOString().slice(0, 10);
  const { data: accts } = await supabase
    .from('talent_accounts')
    .select('id, talent_id, platform, followers')
    .not('followers', 'is', null);
  const rows =
    (accts as { id: string; talent_id: string; platform: string; followers: number }[] | null) ?? [];
  const toInsert = rows
    .filter((a) => a.talent_id && Number(a.followers) > 0)
    .map((a) => ({
      account_id: a.id,
      talent_id: a.talent_id,
      platform: a.platform,
      followers: Number(a.followers),
      captured_on: today,
    }));
  if (toInsert.length > 0) {
    const { error: snapErr } = await supabase
      .from('follower_snapshots')
      .upsert(toInsert, { onConflict: 'account_id,captured_on' });
    if (!snapErr) snapshots = toInsert.length;
  }

  return NextResponse.json({
    checked: conns.length,
    refreshed,
    tiktok_checked: ttConns.length,
    tiktok_refreshed: ttRefreshed,
    follower_snapshots: snapshots,
  });
}
