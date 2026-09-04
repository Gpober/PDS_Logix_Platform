import Link from 'next/link';

/*
  The public face of PDS Logix.

  There wasn't one: `/` redirected straight to /crm or /login, so anyone who
  typed the domain met a password box with no idea what it belonged to. This
  is the same dark ground and electric-cyan accent the CRM already runs on —
  the brand tokens in tailwind.config, not a second palette — scaled up.

  Everything stated here is something the platform actually does. No numbers
  are quoted, because none of them would be ours to publish.
*/

const MODULES = [
  { name: 'Jobs', body: 'Condition reports, detailing and biohazard remediation — priced, tracked and margined from request to invoice.' },
  { name: 'Clients & Assets', body: 'Dealers, fleets and insurers, the people at each of them, and every vehicle serviced by VIN.' },
  { name: 'Production & Pay', body: 'What each technician logged, what it produced, and what it pays — piece-work included.' },
  { name: 'Car Count Recon', body: 'Our count against the auction’s, matched VIN by VIN, with both exception buckets and a CSV to work the gaps.' },
  { name: 'Financials & Cash', body: 'The books and the cash position beside the work that produced them, not in a separate system.' },
  { name: 'Technician Portal', body: 'A phone-sized view for the field: log the work, see your own performance.' },
];

const FLOW = ['Requested', 'Scheduled', 'In progress', 'Completed', 'Invoiced'];

export function Landing() {
  return (
    <div className="min-h-screen bg-ivory text-ink">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-50 border-b border-line bg-[#0B0E13]/90 backdrop-blur-xl">
        <div className="container-x flex items-center justify-between py-4">
          <span className="font-display text-xl tracking-tight text-ink">
            PDS <span className="text-tulip">Logix</span>
          </span>
          <Link
            href="/login"
            className="rounded-xl bg-tulip px-4 py-2 text-sm font-semibold text-[#08131A] transition hover:bg-tulip-dark"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(110% 70% at 80% -10%, rgba(22,180,232,.20) 0%, rgba(22,180,232,0) 55%), radial-gradient(90% 60% at -10% 100%, rgba(22,180,232,.12) 0%, rgba(22,180,232,0) 60%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="container-x relative z-10 pb-16 pt-20 text-center sm:pt-28">
          <p className="eyebrow">Vehicle field service operations</p>

          <h1 className="mx-auto mt-5 max-w-4xl font-display text-4xl leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Every job, every unit, every dollar
            <span className="block text-tulip">in one place.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-stone sm:text-lg">
            Condition reports, detailing and biohazard remediation for dealers, fleets and insurers.
            <span className="text-ink"> The work, the people, the vehicles and the books</span> — one
            system, from the moment a job is requested to the moment it is invoiced.
          </p>

          {/* The job flow, which is the actual state machine in the CRM. */}
          <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-line bg-white p-5 sm:p-7">
            <div className="mb-5 flex items-baseline justify-between">
              <b className="text-sm text-ink sm:text-base">A job, end to end</b>
              <span className="hidden text-[10px] uppercase tracking-[0.16em] text-stone sm:inline">
                Status flow
              </span>
            </div>
            <ol className="flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap">
              {FLOW.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${
                      i === FLOW.length - 1
                        ? 'bg-tulip text-[#08131A]'
                        : 'border border-line bg-blush text-ink'
                    }`}
                  >
                    {step}
                  </span>
                  {i < FLOW.length - 1 && <span aria-hidden className="text-stone">›</span>}
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm text-stone">
              Pricing and margin travel with the job. The condition report lives on the inspection
              that produced it.
            </p>
          </div>

          <div className="mt-10">
            <Link
              href="/login"
              className="inline-flex w-full max-w-md items-center justify-center rounded-2xl bg-gradient-to-r from-tulip to-tulip-dark px-8 py-4 text-lg font-bold text-[#08131A] transition hover:brightness-110"
            >
              Sign in to the CRM
            </Link>
            <p className="mt-3 text-sm text-stone">
              Field technician?{' '}
              <Link href="/login?next=/portal" className="text-tulip underline underline-offset-4">
                Open the portal
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Modules ---------- */}
      <section className="border-t border-line py-16 sm:py-20">
        <div className="container-x">
          <div className="mb-10 text-center">
            <p className="eyebrow">What runs on it</p>
            <h2 className="mt-3 font-display text-2xl tracking-tight text-ink sm:text-3xl">
              The whole operation, not a slice of it.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m) => (
              <div key={m.name} className="rounded-2xl border border-line bg-white p-6">
                <h3 className="flex items-center gap-2 font-display text-base text-ink">
                  <i className="h-1.5 w-1.5 flex-none rounded-full bg-tulip shadow-[0_0_0_4px_rgba(22,180,232,0.16)]" />
                  {m.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-stone">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Zordon ---------- */}
      <section className="border-t border-line py-16 sm:py-20">
        <div className="container-x">
          <div className="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-7 sm:p-10">
            <p className="eyebrow">The assistant</p>
            <h2 className="mt-3 font-display text-2xl tracking-tight text-ink sm:text-3xl">
              Ask <span className="text-tulip">Zordon</span> instead of building the report.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-stone">
              Zordon reads live from the whole CRM and the books — jobs, production, pay, the car
              count recon, invoices and bills. It drafts follow-ups, composes chart reports, and
              remembers what it learned between sessions.
            </p>
            <p className="mt-4 rounded-xl border border-line bg-blush px-4 py-3 text-sm text-stone">
              <span className="font-semibold text-ink">Every write is gated.</span> Anything that
              would change a record surfaces a confirmation card first and only runs when a human
              clicks Confirm.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Foot ---------- */}
      <footer className="border-t border-line py-10">
        <div className="container-x flex flex-col items-center justify-between gap-3 text-sm text-stone sm:flex-row">
          <span className="font-display text-ink">
            PDS <span className="text-tulip">Logix</span>
          </span>
          <span>Pride Dealer Services · vehicle field service operations</span>
        </div>
      </footer>
    </div>
  );
}
