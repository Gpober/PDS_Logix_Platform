'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link';

interface Account { name: string; mask: string | null; balance: number; institution: string | null }
interface Bank { item_id: string; institution: string | null }
interface BalanceResp {
  configured: boolean;
  connected: boolean;
  total?: number;
  accounts?: Account[];
  banks?: Bank[];
  itemErrors?: { institution: string | null; error: string }[];
  asOf?: string;
  error?: string;
}

const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export function BankConnections() {
  const [state, setState] = useState<BalanceResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/plaid/balance');
      setState(await r.json());
    } catch {
      setErr('Couldn’t reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (public_token, metadata) => {
      setBusy(true);
      setLinkToken(null);
      void (async () => {
        try {
          const r = await fetch('/api/plaid/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_token, institution_name: metadata.institution?.name ?? null }),
          });
          const d = await r.json();
          if (!r.ok || !d.ok) setErr(d.error ?? 'Failed to connect.');
          else await load();
        } finally {
          setBusy(false);
        }
      })();
    },
    [load],
  );

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function connect() {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch('/api/plaid/link-token', { method: 'POST' });
      const d = await r.json();
      if (d.link_token) setLinkToken(d.link_token);
      else setErr(d.error ?? 'Could not start the bank connection.');
    } catch {
      setErr('Could not start the bank connection.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(item_id: string) {
    if (!confirm('Disconnect this bank?')) return;
    setBusy(true);
    try {
      await fetch('/api/plaid/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-stone">Loading…</p>;

  if (state && !state.configured) {
    return (
      <div className="rounded-xl border border-dashed border-line p-5 text-sm text-stone">
        Plaid isn’t switched on yet. Set <code>PLAID_CLIENT_ID</code>, <code>PLAID_SECRET</code>, <code>PLAID_ENV</code>{' '}
        (use <code>production</code> for real balances), and <code>SUPABASE_SERVICE_ROLE_KEY</code> in the environment,
        then reload.
      </div>
    );
  }

  const connected = state?.connected && (state.banks?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {connected ? (
        <>
          <div className="rounded-2xl border border-line bg-ivory p-5">
            <p className="text-xs uppercase tracking-wider text-stone">Live cash on hand</p>
            <p className="mt-1 font-display text-3xl tabular-nums text-ink">{usd(state?.total ?? 0)}</p>
            {state?.asOf && <p className="text-xs text-stone">as of {new Date(state.asOf).toLocaleString('en-US')}</p>}
          </div>

          {state?.accounts && state.accounts.length > 0 && (
            <ul className="space-y-1.5">
              {state.accounts.map((a, i) => (
                <li key={i} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5 text-sm">
                  <span className="text-ink">
                    {a.name}
                    {a.mask ? <span className="text-stone"> ••{a.mask}</span> : null}
                    {a.institution ? <span className="text-stone"> · {a.institution}</span> : null}
                  </span>
                  <span className="tabular-nums text-ink">{usd(a.balance)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            {state?.banks?.map((b) => (
              <span key={b.item_id} className="flex items-center gap-2 text-xs text-stone">
                {b.institution ?? 'Bank'}
                <button onClick={() => disconnect(b.item_id)} disabled={busy} className="text-tulip-dark hover:underline disabled:opacity-50">
                  Disconnect
                </button>
              </span>
            ))}
            <button onClick={connect} disabled={busy} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-ink disabled:opacity-50">
              {busy ? 'Working…' : '+ Add another bank'}
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm text-stone">No bank connected yet. Link an account to power the live cash balance and forecast.</p>
          <button onClick={connect} disabled={busy} className="mt-3 rounded-full bg-tulip px-4 py-2 text-sm text-ivory hover:bg-tulip-dark disabled:opacity-50">
            {busy ? 'Working…' : 'Connect a bank'}
          </button>
        </div>
      )}

      {state?.itemErrors && state.itemErrors.length > 0 && (
        <p className="text-xs text-tulip-dark">
          {state.itemErrors.map((e) => `${e.institution ?? 'A bank'}: ${e.error}`).join(' · ')}
        </p>
      )}
      {err && <p className="text-xs text-tulip-dark">{err}</p>}
    </div>
  );
}
