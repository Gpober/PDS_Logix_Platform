import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role Supabase client for the worker. No user session — it runs as the
// service role and bypasses RLS, so it can read every CRM row and update the
// job queue. Worker-only; never runs in the browser.
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function db(): SupabaseClient {
  if (!url || !key) {
    throw new Error('Worker needs SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
