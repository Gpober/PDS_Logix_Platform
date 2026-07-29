import { NextResponse } from 'next/server';
import { getMyStaff } from '@/lib/crm/data';
import { assistantConfigured, runAssistant, normalizeIncomingMessages } from '@/lib/assistant/llm';
import { buildWorkerSystemPrompt, makeWorkerRunner, WORKER_ACTION_TOOLS, WORKER_TOOLS } from '@/lib/assistant/workerTools';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// Worker-scoped Zordon. Any signed-in team member linked to a staff row can use
// it; every tool is pinned to THAT worker, so there's no cross-worker or books
// exposure even though the endpoint is open to non-owners.
export async function POST(req: Request) {
  const staff = await getMyStaff();
  if (!staff) {
    return NextResponse.json({ error: 'No worker profile is linked to your account.' }, { status: 403 });
  }
  if (!assistantConfigured()) {
    return NextResponse.json({ error: 'The assistant isn’t configured yet — set ANTHROPIC_API_KEY.' }, { status: 503 });
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

  const system = buildWorkerSystemPrompt(staff);
  const run = makeWorkerRunner(staff);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      try {
        for await (const event of runAssistant(system, messages, {
          tools: WORKER_TOOLS,
          run,
          actionTools: WORKER_ACTION_TOOLS,
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
