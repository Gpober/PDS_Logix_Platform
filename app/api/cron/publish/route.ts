import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { publishPostById } from '@/lib/crm/publish';
import { notifyPublishFailed } from '@/lib/crm/notify';

export const dynamic = 'force-dynamic';
// Reels encode asynchronously and we poll each container for a few seconds, so
// give the function room to work through a small batch.
export const maxDuration = 60;

// How many times to retry a post before marking it 'failed'. Videos that are
// still encoding ('processing') get a more generous cap since each run just waits.
const MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS_PROCESSING = 10;
const BATCH = 10;

// GET /api/cron/publish — publishes every scheduled post whose time has arrived.
// Triggered by Vercel Cron (see vercel.json). Vercel sends the CRON_SECRET as a
// Bearer token; we also accept ?secret= for manual runs. Uses the service-role
// client because it acts for every creator with no user session.
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
  if (!supabase) {
    return NextResponse.json({ error: 'service_role_not_configured' }, { status: 503 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('content_posts')
    .select('id, publish_attempts')
    .eq('status', 'scheduled')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = (data as { id: string; publish_attempts: number }[]) ?? [];
  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const p of due) {
    const outcome = await publishPostById(supabase, p.id);
    if (outcome.ok) {
      results.push({ id: p.id, ok: true });
      continue;
    }

    const attempts = (p.publish_attempts ?? 0) + 1;
    const cap = outcome.reason === 'processing' ? MAX_ATTEMPTS_PROCESSING : MAX_ATTEMPTS;
    const giveUp = attempts >= cap;
    const reason = outcome.error ?? outcome.reason;
    await supabase
      .from('content_posts')
      .update({
        publish_attempts: attempts,
        publish_error: reason,
        // Keep 'processing' posts scheduled so they retry; on final give-up (or a
        // hard failure) flip to 'failed' so the admin/creator can see it stalled.
        ...(giveUp ? { status: 'failed' } : {}),
      })
      .eq('id', p.id);
    // Tell the creator + owner once, at the moment it's declared failed.
    if (giveUp) await notifyPublishFailed(supabase, p.id, reason);
    results.push({ id: p.id, ok: false, reason: outcome.reason });
  }

  return NextResponse.json({ ran: nowIso, processed: due.length, results });
}
