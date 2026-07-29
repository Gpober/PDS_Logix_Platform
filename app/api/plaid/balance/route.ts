import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/crm/data';
import { createServiceSupabase } from '@/lib/supabase/service';
import { getPlaidClient, isPlaidConfigured } from '@/lib/integrations/plaid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET → live total cash across all connected depository accounts, plus the list
// of connected institutions (item_id is not secret; the access_token stays server-side).
export async function GET() {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Owner/admin only.' }, { status: 403 });
  }
  if (!isPlaidConfigured()) return NextResponse.json({ configured: false, connected: false });

  try {
    const db = createServiceSupabase();
    const { data: items, error } = await db.from('plaid_items').select('item_id, access_token, institution_name');
    if (error) return NextResponse.json({ error: `Failed to load Plaid items: ${error.message}` }, { status: 500 });
    if (!items || items.length === 0) return NextResponse.json({ configured: true, connected: false });

    const client = getPlaidClient();
    const accounts: { name: string; mask: string | null; balance: number; institution: string | null }[] = [];
    const banks: { item_id: string; institution: string | null }[] = [];
    const itemErrors: { institution: string | null; error: string }[] = [];
    let total = 0;

    for (const item of items as { item_id: string; access_token: string; institution_name: string | null }[]) {
      banks.push({ item_id: item.item_id, institution: item.institution_name });
      try {
        const resp = await client.accountsBalanceGet({ access_token: item.access_token });
        for (const acct of resp.data.accounts) {
          if (acct.type !== 'depository') continue; // checking/savings/cash = the forecast base
          const bal = acct.balances.current ?? acct.balances.available ?? 0;
          total += bal;
          accounts.push({ name: acct.name || acct.official_name || 'Account', mask: acct.mask ?? null, balance: bal, institution: item.institution_name ?? null });
        }
      } catch (e) {
        itemErrors.push({ institution: item.institution_name ?? null, error: e instanceof Error ? e.message : 'Failed to fetch balance' });
      }
    }

    return NextResponse.json({ configured: true, connected: true, total: Math.round(total * 100) / 100, accounts, banks, itemErrors, asOf: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to fetch balances.' }, { status: 500 });
  }
}
