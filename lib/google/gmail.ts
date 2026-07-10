import { getGoogleAccessToken } from './tokens';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export type SendResult = { ok: boolean; error?: string };

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// RFC 2822 header values can't contain raw newlines; collapse them.
function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

// Send an email as the logged-in user via their Gmail (lands in their Sent
// folder). Returns {ok:false} with a message when Google isn't connected or the
// API rejects the send.
export async function sendGmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<SendResult> {
  const token = await getGoogleAccessToken();
  if (!token) {
    return { ok: false, error: 'Google account not connected. Sign in with Google to send email.' };
  }
  return sendGmailWithToken(token, params);
}

// Send using an explicitly-provided access token (e.g. the owner's token looked
// up server-side for an anonymous request like a website lead).
export async function sendGmailWithToken(
  token: string,
  params: { to: string; subject: string; body: string },
): Promise<SendResult> {
  const mime = [
    `To: ${headerSafe(params.to)}`,
    `Subject: ${headerSafe(params.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    params.body,
  ].join('\r\n');

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: toBase64Url(mime) }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, error: `Gmail send failed (${res.status}). ${detail.slice(0, 200)}` };
  }
  return { ok: true };
}
