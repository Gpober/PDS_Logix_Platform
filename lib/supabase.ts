import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Public (anon) Supabase client for the website.
 *
 * Uses ONLY the anon key — never the service role. Under RLS, the anon role can
 * read the three public_* views and INSERT into leads, nothing else. Returns
 * null when env vars are absent so pages can render a graceful empty state
 * instead of crashing the build.
 */
export function createPublicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Service-role Supabase client — bypasses RLS. Server-only; NEVER expose to the
 * browser. Used for narrow server tasks that must read protected rows without a
 * user session (e.g. looking up the owner's Google token to email a new lead).
 * Returns null if the service key isn't configured.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
