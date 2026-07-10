import { createServerSupabase } from '@/lib/supabase/server';
import { getGoogleAccessToken } from './tokens';

const CAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

type DealEventInput = {
  dealId: string;
  brandName: string;
  talentName: string;
  bookingDate: string | null; // YYYY-MM-DD
  status: string;
  notes: string | null;
  liveUrl: string | null;
};

// Add one day to an all-day date; Google's all-day `end.date` is exclusive.
function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function eventBody(deal: DealEventInput) {
  const descriptionLines = [
    `Status: ${deal.status}`,
    deal.notes ? `Notes: ${deal.notes}` : null,
    deal.liveUrl ? `Live: ${deal.liveUrl}` : null,
    'Synced from Tulips Talent CRM.',
  ].filter(Boolean);
  return {
    summary: `${deal.brandName} × ${deal.talentName}`,
    description: descriptionLines.join('\n'),
    start: { date: deal.bookingDate! },
    end: { date: nextDay(deal.bookingDate!) },
  };
}

// Auto-sync a deal into the acting user's Google Calendar. Creates the event on
// first sync, updates it thereafter, and removes it if the booking date is
// cleared. Silently no-ops when the user hasn't connected Google. Never throws
// to the caller — a Google outage must not break saving a deal.
export async function syncDealToCalendar(deal: DealEventInput): Promise<void> {
  try {
    const token = await getGoogleAccessToken();
    if (!token) return;

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: mapping } = await supabase
      .from('deal_calendar_events')
      .select('event_id')
      .eq('deal_id', deal.dealId)
      .eq('user_id', user.id)
      .maybeSingle();
    const existingEventId = (mapping as { event_id: string } | null)?.event_id ?? null;

    // No date → nothing to schedule; tidy up any existing event.
    if (!deal.bookingDate) {
      await removeDealFromCalendar(deal.dealId);
      return;
    }

    const body = JSON.stringify(eventBody(deal));
    const authHeader = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    if (existingEventId) {
      const res = await fetch(`${CAL_BASE}/${existingEventId}`, {
        method: 'PUT',
        headers: authHeader,
        body,
        cache: 'no-store',
      });
      // Event was deleted on Google's side — recreate below.
      if (res.status === 404 || res.status === 410) {
        await supabase
          .from('deal_calendar_events')
          .delete()
          .eq('deal_id', deal.dealId)
          .eq('user_id', user.id);
        await createEvent(deal.dealId, user.id, body, authHeader, supabase);
      }
      return;
    }

    await createEvent(deal.dealId, user.id, body, authHeader, supabase);
  } catch {
    // Best-effort sync; swallow so the deal save always succeeds.
  }
}

async function createEvent(
  dealId: string,
  userId: string,
  body: string,
  authHeader: Record<string, string>,
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
): Promise<void> {
  const res = await fetch(CAL_BASE, {
    method: 'POST',
    headers: authHeader,
    body,
    cache: 'no-store',
  });
  if (!res.ok) return;
  const created = (await res.json()) as { id?: string };
  if (!created.id) return;
  await supabase
    .from('deal_calendar_events')
    .upsert(
      { deal_id: dealId, user_id: userId, event_id: created.id },
      { onConflict: 'deal_id,user_id' },
    );
}

// Delete the acting user's calendar event for a deal (used on deal delete or
// when a booking date is cleared).
export async function removeDealFromCalendar(dealId: string): Promise<void> {
  try {
    const token = await getGoogleAccessToken();
    if (!token) return;

    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: mapping } = await supabase
      .from('deal_calendar_events')
      .select('event_id')
      .eq('deal_id', dealId)
      .eq('user_id', user.id)
      .maybeSingle();
    const eventId = (mapping as { event_id: string } | null)?.event_id;
    if (!eventId) return;

    await fetch(`${CAL_BASE}/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    await supabase
      .from('deal_calendar_events')
      .delete()
      .eq('deal_id', dealId)
      .eq('user_id', user.id);
  } catch {
    // Best-effort.
  }
}
