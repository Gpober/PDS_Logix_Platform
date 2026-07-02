'use client';

import { useActionState } from 'react';
import { submitQuote, type ContactState } from './actions';

const field =
  'w-full rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-ink';

const initial: ContactState = { ok: false };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitQuote, initial);

  if (state.ok) {
    return (
      <div className="rounded-3xl border border-line bg-white p-8 text-center">
        <h2 className="font-display text-2xl">Thanks — we&apos;ll be in touch.</h2>
        <p className="mt-3 text-stone">
          Your request is in. A member of the PDS Logix team will follow up shortly.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-3xl border border-line bg-white p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Name *</span>
          <input name="name" required className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Email *</span>
          <input name="email" type="email" required className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Phone</span>
          <input name="phone" className={field} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-stone">Company</span>
          <input name="company" className={field} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm text-stone">Service of interest</span>
        <select name="service_type" defaultValue="" className={field}>
          <option value="">Any / not sure</option>
          <option value="condition_report">Condition Reports</option>
          <option value="detailing">Detailing</option>
          <option value="biohazard">Biohazard</option>
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm text-stone">
          Tell us about your volume &amp; locations
        </span>
        <textarea name="message" rows={4} className={field} />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        disabled={pending}
        className="rounded-full bg-ink px-6 py-3 text-white transition-colors hover:bg-steel disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Request a quote'}
      </button>
    </form>
  );
}
