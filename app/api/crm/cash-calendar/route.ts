import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { getCashCalendar } from '@/lib/crm/cashCalendar';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Owner/admin proxy to the I AM CFO partner cash-calendar endpoint. Keeps the
// partner token server-side while letting the calendar UI fetch any month range.
export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return NextResponse.json({ error: 'Cash calendar is owner/admin-only.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const result = await getCashCalendar({
    from: isDate(from) ? from : null,
    to: isDate(to) ? to : null,
  });

  if (result.status === 'not_configured') {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }
  return NextResponse.json(result.data);
}
