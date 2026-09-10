import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { reconcileProduction } from '@/lib/production/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Prove congruency for a window: walk Connecteam live and the stored copy side
// by side and name every entry that differs.
//
// This is the check to run before trusting a payroll period. It writes nothing —
// repairing a divergence is `/api/cron/connecteam-sync?from=..&to=..` (add
// &prune=1 to also drop entries voided in Connecteam).
//
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   required window
//   ?location=Dallas                 optional scope
//   ?limit=N                         rows listed per bucket (counts stay exact)

export async function GET(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const p = new URL(req.url).searchParams;
  const from = p.get('from');
  const to = p.get('to');
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required.' }, { status: 400 });
  }
  const limitRaw = Number(p.get('limit'));
  try {
    const result = await reconcileProduction({
      from,
      to,
      location: p.get('location') || undefined,
      sampleLimit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 500) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'reconcile failed' },
      { status: 500 },
    );
  }
}
