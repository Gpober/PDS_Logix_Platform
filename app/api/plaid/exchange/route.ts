import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServiceSupabase } from '@/lib/supabase/service';
import { getPlaidClient, isPlaidConfigured } from '@/lib/integrations/plaid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST → exchange the Link public_token for a long-lived access_token and store
// it (service-role only). The access_token never returns to the client.
export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: 'Plaid isn’t configured.' }, { status: 503 });
  }
  let body: { public_token?: string; institution_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }
  if (!body.public_token) return NextResponse.json({ error: 'Missing public_token.' }, { status: 400 });

  try {
    const ex = await getPlaidClient().itemPublicTokenExchange({ public_token: body.public_token });
    const { error } = await createServiceSupabase().from('plaid_items').upsert(
      {
        item_id: ex.data.item_id,
        access_token: ex.data.access_token,
        institution_name: body.institution_name || null,
      },
      { onConflict: 'item_id' },
    );
    if (error) return NextResponse.json({ error: `Connected, but failed to store: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, institution_name: body.institution_name || null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to exchange token.' }, { status: 500 });
  }
}
