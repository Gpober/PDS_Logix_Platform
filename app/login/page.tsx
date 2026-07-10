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

  const field = 'w-full rounded-xl border border-line bg-white px-4 py-3 outline-none focus:border-ink';

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <div className="text-center">
        <span className="font-display text-3xl">
          PDS Logix<span className="text-tulip">.</span>
        </span>
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
        className="w-full rounded-full bg-ink px-6 py-3 text-ivory transition-colors hover:bg-tulip disabled:opacity-60"
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
