// app/api/cron/heartbeat/route.ts
//
// The heartbeat.
//
// Everything else Zordon does happens because a human typed something. This
// runs whether or not anyone is looking: it checks the business against a set
// of thresholds, and only when something crosses one does it ask the model
// whether the owner should hear about it.
//
// Two rules shape the whole thing:
//
//   1. Signals are computed in code, never by the model. The model decides
//      what matters; it is never asked to go looking for something to say.
//      Given a whole database and an open question, an LLM will always find
//      something — which is the same as finding nothing.
//
//   2. Silence is the expected outcome, and it is recorded. A loop that only
//      writes a row when it has news is a loop you cannot audit: a quiet week
//      and a broken cron look identical from the outside. Every run lands in
//      `heartbeats`, including the ones that decided to say nothing.
//
// Read-only. The heartbeat notices; it does not act. Acting on its own needs a
// standing mandate that does not exist yet, and inventing one here would be
// the wrong place to decide it.

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceSupabase, serviceConfigured } from '@/lib/supabase/service';
import { computeSignals, signalsToText, type Signal } from '@/lib/heartbeat/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-opus-5';

const SYSTEM = `You are Zordon, chief of staff for PDS Logix — a vehicle field-service business doing condition reports, detailing and biohazard remediation for dealers, fleets and insurers.

A scheduled check has found the signals below. Decide whether the owner should hear about any of it right now.

Rules, in order:
1. The signals are the only facts you have. Never state a number that is not in them. Never infer a cause you cannot see.
2. Most runs should be NOT notable. A standing condition the owner already knows about is not news. Something crossing a line for the first time, or getting materially worse, is.
3. If it is notable, pick ONE thing. The value of this is that it refuses to hand over a list to triage.
4. "Hand off" is work that should leave the owner's desk today. "Ignore" is work that will feel urgent and is not. Both may be empty.
5. Write like someone who knows the business. Short sentences, no headings, no bullet characters inside a field.

You are reporting, not acting. Do not say you have done anything.`;

const BRIEF_TOOL: Anthropic.Tool = {
  name: 'file_beat',
  description: 'File the result of this heartbeat, notable or not.',
  input_schema: {
    type: 'object',
    properties: {
      notable: {
        type: 'boolean',
        description:
          'True only if the owner should look at this now. A known, steady condition is not notable.',
      },
      headline: { type: 'string', description: 'One sentence. On a quiet beat, say plainly that nothing needs them.' },
      one_thing: { type: 'string', description: 'The single thing worth doing, tied to a figure from the signals. Empty string if not notable.' },
      hand_off: { type: 'array', items: { type: 'string' }, description: 'Up to 3 lines. May be empty.' },
      ignore: { type: 'array', items: { type: 'string' }, description: 'Up to 3 lines. May be empty.' },
      watch: { type: 'string', description: 'The one number to watch and the level that would mean trouble. Empty string if none.' },
    },
    required: ['notable', 'headline', 'one_thing', 'hand_off', 'ignore', 'watch'],
  },
};

interface Beat {
  notable: boolean;
  headline: string;
  one_thing: string;
  hand_off: string[];
  ignore: string[];
  watch: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Same auth as the other cron: Vercel sends the bearer, a human can pass ?key=.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authed =
      req.headers.get('authorization') === `Bearer ${secret}` || url.searchParams.get('key') === secret;
    if (!authed) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!serviceConfigured()) {
    return NextResponse.json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not set.' }, { status: 503 });
  }

  // ?dryRun=1 returns the signals without calling the model or writing a row —
  // the way to see what the heartbeat is looking at without spending a beat.
  const dryRun = url.searchParams.get('dryRun') === '1';
  const sb = createServiceSupabase();

  let signals: Signal[];
  try {
    signals = await computeSignals(sb);
  } catch (error: any) {
    console.error('[heartbeat] could not compute signals:', error?.message || error);
    await sb.from('heartbeats').insert({
      outcome: 'error',
      error: String(error?.message || error).slice(0, 500),
    });
    return NextResponse.json({ ok: false, error: 'Could not read the business.' }, { status: 500 });
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, signals });
  }

  // Nothing crossed a threshold. Record the quiet beat and stop — there is no
  // question to put to the model, and asking one anyway is how a heartbeat
  // learns to manufacture news.
  if (!signals.length) {
    await sb.from('heartbeats').insert({ outcome: 'silent_no_signals', notable: false, signals: [] });
    return NextResponse.json({ ok: true, notable: false, outcome: 'silent_no_signals', signals: [] });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    await sb.from('heartbeats').insert({
      outcome: 'error',
      error: 'ANTHROPIC_API_KEY is not set',
      signals,
    });
    return NextResponse.json({ ok: false, error: 'The assistant is not configured.' }, { status: 503 });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [BRIEF_TOOL],
      tool_choice: { type: 'tool', name: 'file_beat' },
      messages: [
        {
          role: 'user',
          content: `Today is ${new Date().toISOString().slice(0, 10)}.\n\nSignals:\n\n${signalsToText(signals)}\n\nFile the beat.`,
        },
      ],
    });

    const call = response.content.find((b) => b.type === 'tool_use');
    if (!call || call.type !== 'tool_use') throw new Error('The model did not file a beat');
    const beat = call.input as unknown as Beat;

    await sb.from('heartbeats').insert({
      outcome: beat.notable ? 'notable' : 'silent',
      notable: !!beat.notable,
      headline: beat.headline || null,
      one_thing: beat.one_thing || null,
      hand_off: beat.hand_off ?? [],
      ignore_list: beat.ignore ?? [],
      watch: beat.watch || null,
      signals,
    });

    return NextResponse.json({ ok: true, ...beat, signals });
  } catch (error: any) {
    console.error('[heartbeat] failed:', error?.message || error);
    await sb.from('heartbeats').insert({
      outcome: 'error',
      error: String(error?.message || error).slice(0, 500),
      signals,
    });
    return NextResponse.json({ ok: false, error: 'The heartbeat could not complete.' }, { status: 500 });
  }
}
