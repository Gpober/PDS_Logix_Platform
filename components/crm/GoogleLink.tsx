'use client';

import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';

function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

// Header chip: shows "Google linked" when the user has connected Google, or a
// "Connect Google" button that runs the OAuth flow (with Calendar + Gmail send
// scopes and offline access) so we capture their refresh token on return.
export function GoogleLink({ connected }: { connected: boolean }) {
  const [loading, setLoading] = useState(false);

  if (connected) {
    return (
      <span className="hidden items-center gap-1.5 rounded-full bg-[#5B8C5A]/15 px-3 py-1 text-xs font-medium text-[#5B8C5A] sm:inline-flex">
        <GoogleG className="h-3.5 w-3.5" /> Google linked
      </span>
    );
  }

  async function connect() {
    setLoading(true);
    const supabase = createBrowserSupabase();
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', '/crm');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
        scopes:
          'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) setLoading(false);
  }

  return (
    <button
      onClick={connect}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium transition-colors hover:border-ink disabled:opacity-60"
    >
      <GoogleG className="h-3.5 w-3.5" />
      {loading ? 'Connecting…' : 'Connect Google'}
    </button>
  );
}
