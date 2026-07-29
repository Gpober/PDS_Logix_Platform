import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServiceSupabase } from '@/lib/supabase/service';
import { getPlaidClient, isPlaidConfigured } from '@/lib/integrations/plaid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST { item_id } → remove the Plaid item at Plaid and delete the stored token.
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  if (!isPlaidConfigured()) return NextResponse.json({ error: 'Plaid isn’t configured.' }, { status: 503 });

  let body: { item_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }
  if (!body.item_id) return NextResponse.json({ error: 'Missing item_id.' }, { status: 400 });

  const db = createServiceSupabase();
  const { data: item } = await db.from('plaid_items').select('access_token').eq('item_id', body.item_id).maybeSingle();
  // Best-effort remove at Plaid; delete our record regardless.
  if (item?.access_token) {
    try {
      await getPlaidClient().itemRemove({ access_token: item.access_token as string });
    } catch {
      /* item may already be gone at Plaid; still clear ours */
    }
  }
  const { error } = await db.from('plaid_items').delete().eq('item_id', body.item_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
