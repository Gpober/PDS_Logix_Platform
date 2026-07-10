import type { SupabaseClient } from '@supabase/supabase-js';
import { getOwnerGoogleAccessToken } from '@/lib/google/tokens';
import { sendGmailWithToken } from '@/lib/google/gmail';

// Best-effort email when a scheduled post has exhausted its retries. Goes to the
// creator (so they can fix + reschedule) and the owner (so nothing slips). Sent
// via the owner's Gmail token, looked up without a session (service role).
// Silently no-ops if email isn't set up — publishing must never depend on it.
export async function notifyPublishFailed(
  supabase: SupabaseClient,
  postId: string,
  error: string,
): Promise<void> {
  try {
    const { data } = await supabase
      .from('content_posts')
      .select('caption, talent:talent_id(name, email)')
      .eq('id', postId)
      .maybeSingle();
    const row = data as { caption: string | null; talent: { name: string; email: string | null } | { name: string; email: string | null }[] | null } | null;
    const talent = Array.isArray(row?.talent) ? row?.talent[0] : row?.talent;

    const owner = await getOwnerGoogleAccessToken();
    if (!owner) return;

    const to = [talent?.email, owner.ownerEmail].filter(Boolean).join(', ');
    if (!to) return;

    const caption = row?.caption?.trim();
    const snippet = caption ? `“${caption.slice(0, 80)}${caption.length > 80 ? '…' : ''}”` : 'a scheduled post';

    await sendGmailWithToken(owner.token, {
      to,
      subject: `Instagram post didn’t publish${talent?.name ? ` — ${talent.name}` : ''}`,
      body:
        `${talent?.name ? talent.name + ', your' : 'Your'} scheduled Instagram post (${snippet}) ` +
        `couldn’t be published.\n\nReason: ${error}\n\n` +
        `Open your content planner to fix it and set the status back to Scheduled to retry:\n` +
        `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tulipstalent.co'}/portal/content\n`,
    });
  } catch {
    // Notifications are best-effort; never let them affect the publish flow.
  }
}
