import { NextResponse } from 'next/server';
import { buildDailyReport, yesterdayCentral } from '@/lib/production/dailyReport';
import { sendMail } from '@/lib/integrations/google';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The daily piecework email — yesterday / this week / this month, pieces and
// revenue, Piecework and Photo Dept.
//
// This replaces the Claude Routine that used to assemble it from the synced copy
// of Connecteam. Built here, it reads the same source layer as every other
// production number (Connecteam live for these windows, the stored copy as
// backup), it carries its own staleness banner, and the numbers and the template
// are version-controlled together instead of living in a prompt.
//
//   ?preview=1                 — render and RETURN the HTML; sends nothing.
//                                Open it in a browser to see exactly what would
//                                go out.
//   ?json=1                    — the figures behind the email, no HTML.
//   ?asOf=YYYY-MM-DD           — report on a specific day instead of yesterday.
//   ?to=a@b.com,c@d.com        — override recipients for a test send.
//   ?force=1                   — send even when the health banner is non-empty.
//   Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`; for manual calls
//   pass ?key=$CRON_SECRET.
//
// Recipients come from DAILY_REPORT_TO (comma-separated). Unset = no send, which
// is deliberate: a misconfigured deploy should go quiet, not mail the wrong people.

function recipients(override: string | null): string[] {
  const raw = override ?? process.env.DAILY_REPORT_TO ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authed =
      req.headers.get('authorization') === `Bearer ${secret}` ||
      url.searchParams.get('key') === secret;
    if (!authed) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const asOfRaw = url.searchParams.get('asOf');
  const asOf = asOfRaw && /^\d{4}-\d{2}-\d{2}$/.test(asOfRaw) ? asOfRaw : yesterdayCentral();
  const preview = url.searchParams.get('preview') === '1';
  const jsonOnly = url.searchParams.get('json') === '1';
  const force = url.searchParams.get('force') === '1';

  let report;
  try {
    report = await buildDailyReport(asOf);
  } catch (e) {
    console.error('[daily-production-report] build failed', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'build failed' },
      { status: 500 },
    );
  }

  const figures = {
    asOf,
    subject: report.subject,
    pieces: {
      day: report.totals.piecework[0] + report.totals.photo[0],
      week: report.totals.piecework[2] + report.totals.photo[2],
      month: report.totals.piecework[4] + report.totals.photo[4],
    },
    piecework: report.totals.piecework,
    photo: report.totals.photo,
    unpriced: report.unpriced,
    warnings: report.warnings,
    sources: report.data.reads,
    workers: report.data.workers.length,
  };

  if (preview) {
    return new NextResponse(report.html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  if (jsonOnly) return NextResponse.json({ ok: true, ...figures });

  const to = recipients(url.searchParams.get('to'));
  if (!to.length) {
    return NextResponse.json(
      { ok: false, error: 'No recipients — set DAILY_REPORT_TO.', ...figures },
      { status: 400 },
    );
  }

  // A report whose own health check is unhappy does not go out silently. The
  // banner is already in the HTML; this is the second gate, for the case where
  // the numbers are so suspect that sending is worse than not sending.
  const blocking = report.warnings.filter((w) => w.startsWith('No production recorded'));
  if (blocking.length && !force) {
    console.warn(`[daily-production-report] held back: ${blocking.join(' ')}`);
    return NextResponse.json(
      { ok: false, held: true, reason: blocking, hint: 'Re-run with &force=1 to send anyway.', ...figures },
      { status: 409 },
    );
  }

  const sent = await sendMail({ to, subject: report.subject, html: report.html });
  console.log(
    `[daily-production-report] ${asOf} to=${to.length} pieces=${figures.pieces.day} sent=${sent.ok}` +
      (sent.error ? ` error=${sent.error}` : ''),
  );
  return NextResponse.json({ ok: sent.ok, sent, to, ...figures }, { status: sent.ok ? 200 : 502 });
}
