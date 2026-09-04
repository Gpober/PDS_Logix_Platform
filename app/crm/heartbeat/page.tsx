import { createServerSupabase } from '@/lib/supabase/server';
import { CrmHeader, Empty } from '@/components/crm/ui';

export const dynamic = 'force-dynamic';

// The heartbeat's log, including the quiet runs.
//
// Showing the silent beats is the point. If this page only listed the days
// something was wrong, you could not tell a calm month from a cron that
// stopped firing three weeks ago.

interface Row {
  id: string;
  ran_at: string;
  notable: boolean;
  headline: string | null;
  one_thing: string | null;
  hand_off: string[] | null;
  ignore_list: string[] | null;
  watch: string | null;
  outcome: string;
  error: string | null;
  signals: { kind: string; line: string; detail: string[] }[] | null;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default async function HeartbeatPage() {
  const sb = await createServerSupabase();
  const { data } = await sb
    .from('heartbeats')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(40);

  const beats = (data ?? []) as Row[];
  const latest = beats[0];
  const rest = beats.slice(1);

  return (
    <div className="mx-auto max-w-4xl">
      <CrmHeader title="Heartbeat" />

      <p className="mb-6 text-sm text-stone">
        Runs on its own each weekday morning, checks the business against a set of thresholds, and speaks up only
        when something crosses one. Quiet runs are listed too — a calm week and a stopped cron should not look the
        same.
      </p>

      {!latest ? (
        <Empty>No beats yet. The first one runs on the next weekday morning.</Empty>
      ) : (
        <>
          <div
            className={`rounded-2xl border p-6 ${
              latest.notable ? 'border-tulip/50 bg-tulip/[0.06]' : 'border-line bg-white'
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  latest.outcome === 'error'
                    ? 'bg-red-500/15 text-red-400'
                    : latest.notable
                      ? 'bg-tulip/20 text-tulip'
                      : 'bg-stone/15 text-stone'
                }`}
              >
                {latest.outcome === 'error' ? 'Error' : latest.notable ? 'Worth a look' : 'Nothing needed'}
              </span>
              <span className="text-xs text-stone">{when(latest.ran_at)}</span>
            </div>

            {latest.error ? (
              <p className="text-sm text-red-400">{latest.error}</p>
            ) : (
              <>
                {latest.headline && <p className="text-base leading-relaxed text-ink">{latest.headline}</p>}

                {latest.one_thing && (
                  <div className="mt-5">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-tulip">
                      The one thing
                    </p>
                    <p className="text-sm leading-relaxed text-ink">{latest.one_thing}</p>
                  </div>
                )}

                {(latest.hand_off?.length || latest.ignore_list?.length) ? (
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    {latest.hand_off?.length ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone">Hand off</p>
                        <ul className="space-y-1.5">
                          {latest.hand_off.map((h) => (
                            <li key={h} className="text-sm leading-relaxed text-stone">{h}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {latest.ignore_list?.length ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone">Ignore</p>
                        <ul className="space-y-1.5">
                          {latest.ignore_list.map((i) => (
                            <li key={i} className="text-sm leading-relaxed text-stone">{i}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {latest.watch && (
                  <p className="mt-5 border-t border-line pt-4 text-sm text-stone">
                    <span className="font-semibold text-ink">Watch:</span> {latest.watch}
                  </p>
                )}
              </>
            )}

            {/* The facts the judgment was made from, so it can be checked. */}
            {latest.signals?.length ? (
              <details className="mt-5 border-t border-line pt-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.18em] text-stone">
                  What it looked at ({latest.signals.length})
                </summary>
                <ul className="mt-3 space-y-3">
                  {latest.signals.map((s) => (
                    <li key={s.kind}>
                      <p className="text-sm text-ink">{s.line}</p>
                      {s.detail?.length ? (
                        <ul className="mt-1 space-y-0.5">
                          {s.detail.map((d) => (
                            <li key={d} className="text-xs text-stone">· {d}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

          {rest.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone">Earlier</p>
              <ul className="divide-y divide-line rounded-xl border border-line bg-white">
                {rest.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-baseline gap-3 px-4 py-3">
                    <span className="w-40 flex-none text-xs text-stone">{when(b.ran_at)}</span>
                    <span
                      className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        b.outcome === 'error'
                          ? 'bg-red-500/15 text-red-400'
                          : b.notable
                            ? 'bg-tulip/20 text-tulip'
                            : 'bg-stone/15 text-stone'
                      }`}
                    >
                      {b.outcome === 'error' ? 'error' : b.notable ? 'worth a look' : 'quiet'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-stone">
                      {b.error || b.headline || 'Nothing crossed a threshold.'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
