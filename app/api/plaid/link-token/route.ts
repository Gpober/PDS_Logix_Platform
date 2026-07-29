import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { getPlaidClient, getPlaidCountryCodes, getPlaidProducts, isPlaidConfigured } from '@/lib/integrations/plaid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST → a Plaid Link token to open the bank-connect flow on the client.
export async function POST() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: 'Plaid isn’t configured — set PLAID_CLIENT_ID, PLAID_SECRET, and SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });
  }
  try {
    const resp = await getPlaidClient().linkTokenCreate({
      user: { client_user_id: 'pds-logix' },
      client_name: 'PDS Logix',
      language: 'en',
      country_codes: getPlaidCountryCodes(),
      products: getPlaidProducts(),
    });
    return NextResponse.json({ link_token: resp.data.link_token });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create link token.' }, { status: 500 });
  }
}
