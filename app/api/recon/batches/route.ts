import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { listReconBatches } from '@/lib/crm/recon';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// The reconciliations on file (newest first), and DELETE to drop one (its
// uploaded units go with it). Owner/admin only.

export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  return NextResponse.json({ batches: await listReconBatches() });
}

export async function DELETE(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('recon_batches').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
