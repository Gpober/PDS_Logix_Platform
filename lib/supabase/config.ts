// Supabase connection settings.
//
// The URL and anon (publishable) key are PUBLIC by design — they ship to the
// browser and are safe to commit; access is governed by Row Level Security, not
// by keeping these secret. We default to the PDS Logix CRM project so the app
// connects out of the box, while still letting the environment override them
// (set NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel to
// point at a different project).
//
// NOTE: the service-role key and ANTHROPIC_API_KEY are secrets and are NOT here
// — they stay in the server environment only.

const DEFAULT_SUPABASE_URL = 'https://xqyxpefsukilkqevspfv.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxeXhwZWZzdWtpbGtxZXZzcGZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDg4ODQsImV4cCI6MjA5ODUyNDg4NH0.WDxOEbDew6AsMehppbKjBhlEkWZsKdG1mYgKrAETyuQ';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
