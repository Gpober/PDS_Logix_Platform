'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/crm';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => params.get('error'));
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    const supabase = createBrowserSupabase();
    // Route Google back through our callback, carrying `next` so the user lands
    // where they were originally headed after the code exchange.
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callback.toString(),
        // Calendar + Gmail send, on top of the default identity scopes. These are
        // "sensitive" (not "restricted"), so they need only brand verification —
        // no gmail.readonly, which would force a CASA security assessment.
        scopes:
          'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send',
        // offline so Google returns a refresh token on first authorization. No
        // forced `prompt: consent` here, so returning users aren't re-asked to
        // allow every login — re-granting is done via the header "Connect Google".
        queryParams: { access_type: 'offline' },
      },
    });
    if (error) {
      setError(error.message);
      setGoogleLoading(false);
    }
    // On success the browser is redirected to Google — no further work here.
  }

  const field =
    'w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-ink';

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <div className="text-center">
        <Link href="/" className="font-display text-3xl">
          Tulips<span className="text-tulip">.</span>
        </Link>
        <p className="eyebrow mt-6">Team CRM</p>
        <h1 className="mb-6 font-display text-3xl">Sign in</h1>
      </div>

      <label className="mb-1.5 block text-sm text-stone" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={field + ' mb-4'}
        placeholder="you@tulipstalent.com"
        autoComplete="email"
        required
      />
      <label className="mb-1.5 block text-sm text-stone" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field + ' mb-5'}
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />

      {error && <p className="mb-4 text-sm text-tulip">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-full bg-ink px-6 py-3 text-ivory transition-colors hover:bg-tulip disabled:opacity-60"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="my-6 flex items-center gap-4 text-xs text-stone">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleLoading || loading}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-6 py-3 font-medium transition-colors hover:border-ink disabled:opacity-60"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
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
        {googleLoading ? 'Redirecting…' : 'Continue with Google'}
      </button>

      <p className="mt-6 text-center text-sm text-stone">
        Accounts are invite-only. Ask an owner to add you.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center px-5">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
