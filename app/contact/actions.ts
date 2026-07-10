'use server';

import { createPublicClient } from '@/lib/supabase';
import { getOwnerGoogleAccessToken } from '@/lib/google/tokens';
import { sendGmailWithToken } from '@/lib/google/gmail';

export interface ContactState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export async function submitLead(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const firstName = String(formData.get('first_name') ?? '').trim();
  const lastName = String(formData.get('last_name') ?? '').trim();
  const name = `${firstName} ${lastName}`.trim();
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const company = String(formData.get('company') ?? '').trim();
  const talentOfInterest = String(formData.get('talent_of_interest') ?? '').trim();
  const messageBody = String(formData.get('message') ?? '').trim();
  const message = phone ? `${messageBody}\n\nPhone: ${phone}` : messageBody;

  // Honeypot: bots fill hidden fields. Pretend success, drop the submission.
  if (String(formData.get('website') ?? '').length > 0) {
    return { status: 'success', message: 'Thanks — we’ll be in touch shortly.' };
  }

  if (!name || !email) {
    return { status: 'error', message: 'Please add your name and email.' };
  }
  if (!isEmail(email)) {
    return { status: 'error', message: 'That email doesn’t look right.' };
  }

  const supabase = createPublicClient();
  if (!supabase) {
    return { status: 'error', message: 'The form isn’t configured yet. Please email us directly.' };
  }

  // Insert under the anon role; RLS allows INSERT into leads but never SELECT.
  const { error } = await supabase.from('leads').insert({
    name,
    email,
    company: company || null,
    talent_of_interest: talentOfInterest || null,
    message: message || null,
    source: 'website',
  });

  if (error) {
    console.error('submitLead', error.message);
    return { status: 'error', message: 'Something went wrong. Please try again.' };
  }

  // Best-effort email alert via the owner's connected Gmail. Never blocks or
  // fails the submission — the lead is already saved above and visible in the
  // CRM regardless.
  void notifyTeamOfLead({ name, email, phone, message: messageBody });

  return { status: 'success', message: 'Thanks — your enquiry is in. We’ll be in touch shortly.' };
}

async function notifyTeamOfLead(lead: {
  name: string;
  email: string;
  phone: string;
  message: string;
}): Promise<void> {
  try {
    const owner = await getOwnerGoogleAccessToken();
    if (!owner) return; // No service key / no connected Gmail — skip silently.
    const to = process.env.LEADS_NOTIFY_EMAIL || owner.ownerEmail;
    if (!to) return;

    const body = [
      'New enquiry from tulipstalent.co:',
      '',
      `Name:  ${lead.name}`,
      `Email: ${lead.email}`,
      lead.phone ? `Phone: ${lead.phone}` : null,
      '',
      'Message:',
      lead.message || '(none)',
      '',
      'View in CRM → Leads.',
    ]
      .filter((l) => l !== null)
      .join('\n');

    await sendGmailWithToken(owner.token, {
      to,
      subject: `🌷 New lead: ${lead.name}`,
      body,
    });
  } catch (e) {
    console.error('notifyTeamOfLead', e instanceof Error ? e.message : e);
  }
}
