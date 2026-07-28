import { NextResponse } from 'next/server';
import { getCurrentProfile, listAssistantMemories } from '@/lib/crm/data';
import { assistantConfigured, runAssistant, normalizeIncomingMessages } from '@/lib/assistant/llm';
import { buildSystemPrompt } from '@/lib/assistant/prompt';
import { ACTION_TOOLS, ASSISTANT_TOOLS, runAssistantTool } from '@/lib/assistant/tools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Tool loops can run several model round-trips; give them room.
export const maxDuration = 120;

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  const isOwner = profile?.role === 'owner' || profile?.role === 'admin';
  if (!isOwner) {
    return NextResponse.json({ error: 'The assistant is owner/admin-only.' }, { status: 403 });
  }
  if (!assistantConfigured()) {
    return NextResponse.json(
      { error: 'The assistant isn’t configured yet — set ANTHROPIC_API_KEY.' },
      { status: 503 },
    );
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const messages = normalizeIncomingMessages(body.messages);
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Expected a user message.' }, { status: 400 });
  }

  const memories = await listAssistantMemories();
  const system = buildSystemPrompt(profile, memories);

  // NDJSON stream: one JSON object per line.
  //   {t:'text', v:string} | {t:'tool', v:string} |
  //   {t:'action', v:{name,input}} | {t:'error', v:string}
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        for await (const event of runAssistant(system, messages, {
          tools: ASSISTANT_TOOLS,
          run: runAssistantTool,
          actionTools: ACTION_TOOLS,
        })) {
          if (event.type === 'text') send({ t: 'text', v: event.text });
          else if (event.type === 'action') send({ t: 'action', v: { name: event.name, input: event.input } });
          else send({ t: 'tool', v: event.name });
        }
      } catch (e) {
        send({ t: 'error', v: e instanceof Error ? e.message : 'The assistant hit an error.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}
