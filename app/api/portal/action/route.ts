import { NextResponse } from 'next/server';
import { getMyStaff } from '@/lib/crm/data';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Executes a worker's confirmed proposal from portal Zordon. Only set_goal is
// gated here; it writes the worker's OWN monthly target. Scoped to the signed-in
// worker — the staff row comes from their session, never the request body.
export async function POST(req: Request) {
  const staff = await getMyStaff();
  if (!staff) return NextResponse.json({ error: 'No worker profile is linked to your account.' }, { status: 403 });

  let body: { kind?: string; input?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.kind !== 'set_goal') {
    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  }

  const input = body.input ?? {};
  const target = Math.trunc(Number(input.target_units));
  if (!Number.isFinite(target) || target < 0) {
    return NextResponse.json({ error: 'Give a valid target.' }, { status: 400 });
  }
  const periodRaw = typeof input.period === 'string' && /^\d{4}-\d{2}$/.test(input.period) ? input.period : null;

  const supabase = await createServerSupabase();
  let sel = supabase.from('production_goals').select('id').eq('staff_name', staff.name).is('location', null);
  sel = periodRaw === null ? sel.is('period', null) : sel.eq('period', periodRaw);
  const { data: existing } = await sel.maybeSingle();
  const payload = {
    staff_name: staff.name,
    location: null as string | null,
    period: periodRaw,
    target_units: target,
    updated_at: new Date().toISOString(),
  };
  const { error } = (existing as { id: string } | null)?.id
    ? await supabase.from('production_goals').update(payload).eq('id', (existing as { id: string }).id)
    : await supabase.from('production_goals').insert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const label = periodRaw
    ? `for ${new Date(`${periodRaw}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : 'every month';
  return NextResponse.json({ ok: true, message: `Goal set to ${target.toLocaleString('en-US')} units ${label}.` });
}
