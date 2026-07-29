import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './config';

// Service-role Supabase client — bypasses RLS. SERVER-ONLY. Used for tables that
// deny all access under RLS (e.g. plaid_items, which stores secret Plaid access
// tokens). Never import this into a client component.
export function serviceConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let cached: SupabaseClient | null = null;

export function createServiceSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  if (!cached) cached = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
