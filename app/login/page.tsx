'use client';

import { Suspense, useState } from 'react';
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

  // Sign in with Google (Supabase OAuth). Redirects to Google, then back through
  // /auth/callback. MFA is enforced by the user's Google 2-Step Verification.
  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createBrowserSupabase();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser is redirected to Google — nothing else to do here.
  }

  const field = 'w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-ink';

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pds-crest.svg" alt="" className="mx-auto mb-4 h-14 w-14" />
        <span className="font-display text-3xl">
          PDS Logix<span className="text-tulip">.</span>
        </span>
        <p className="eyebrow mt-6">Team CRM</p>
        <h1 className="mb-6 font-display text-3xl">Sign in</h1>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="mb-5 flex w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-6 py-3 text-ink transition-colors hover:border-ink disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
        Continue with Google
      </button>

      <div className="mb-5 flex items-center gap-3 text-xs text-stone">
        <span className="h-px flex-1 bg-line" /> or email <span className="h-px flex-1 bg-line" />
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
        placeholder="you@pdslogix.com"
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
        className="w-full rounded-full bg-tulip px-6 py-3 text-ivory transition-colors hover:bg-tulip-dark disabled:opacity-60"
      >
        {loading ? 'Signing in…' : 'Sign in'}
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
