'use server';

import { createServerSupabase } from '@/lib/supabase/server';

export type ContactState = { ok: boolean; error?: string };

// Public "request a quote" — inserts a lead under the anon role (RLS allows
// INSERT only; the row is never readable by the public).
export async function submitQuote(_prev: ContactState, form: FormData): Promise<ContactState> {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  };

  const name = get('name');
  const email = get('email');
  if (!name || !email) {
    return { ok: false, error: 'Name and email are required.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('leads').insert({
    name,
    email,
    phone: get('phone'),
    company: get('company'),
    service_type: get('service_type'),
    message: get('message'),
    source: 'website',
  });

  if (error) return { ok: false, error: 'Something went wrong. Please try again.' };
  return { ok: true };
}
