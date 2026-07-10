'use client';

import { useActionState } from 'react';
import { submitLead, type ContactState } from './actions';

const initialState: ContactState = { status: 'idle' };

const field =
  'w-full rounded-xl border border-line bg-white/60 px-4 py-3 text-ink outline-none transition-colors placeholder:text-stone/50 focus:border-ink';

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitLead, initialState);

  if (state.status === 'success') {
    return (
      <div className="rounded-2xl border border-line bg-blush/60 p-8">
        <p className="font-display text-2xl">Thank you 🌷</p>
        <p className="mt-2 text-stone">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Honeypot — visually hidden, not for humans */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
        aria-hidden="true"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm text-stone" htmlFor="first_name">
            First Name
          </label>
          <input id="first_name" name="first_name" required className={field} placeholder="First name" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-stone" htmlFor="last_name">
            Last Name
          </label>
          <input id="last_name" name="last_name" required className={field} placeholder="Last name" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm text-stone" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className={field}
            placeholder="you@email.com"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm text-stone" htmlFor="phone">
            Phone Number
          </label>
          <input id="phone" name="phone" type="tel" className={field} placeholder="(000) 000-0000" />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm text-stone" htmlFor="message">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          className={field}
          placeholder="Tell us a little about you and how we can help…"
        />
      </div>

      {state.status === 'error' && <p className="text-sm text-tulip">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-ink px-8 py-3 text-sm text-ivory transition-colors hover:bg-tulip disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
