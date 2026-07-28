import Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_MAX_TOKENS, ASSISTANT_MODEL } from './config';

// The provider seam. Everything model-specific lives here so the rest of the
// assistant talks to one small interface — swap Claude for anything in this
// file alone. Server-only: the API key never reaches the browser.

export type AssistantRole = 'user' | 'assistant';
// A user turn can carry images and PDFs (photos of a vehicle, an invoice sheet,
// a condition report) alongside text — Claude reads them natively. Content is
// either plain text or a list of text / image / document blocks.
export type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };
export interface AssistantMessage {
  role: AssistantRole;
  content: string | AssistantContentBlock[];
}

// Validate + cap client-supplied messages before they reach the model. Text is
// truncated; images/PDFs are restricted to safe media types and bounded in
// count and size.
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_IMAGES = 6;
const MAX_DOCS = 3;
const MAX_IMAGE_B64 = 8_000_000; // ~6MB decoded
const MAX_DOC_B64 = 20_000_000; // ~15MB PDF
// Generous so a pasted-in CSV / list survives (owner/admin-only tool). Attached
// CSVs are parsed in the browser and sent as a small preview, so this mainly
// guards raw pastes.
const MAX_TEXT = 100_000;

function sanitizeContent(raw: unknown): AssistantMessage['content'] | null {
  if (typeof raw === 'string') return raw.slice(0, MAX_TEXT);
  if (!Array.isArray(raw)) return null;
  const blocks: AssistantContentBlock[] = [];
  let images = 0;
  let docs = 0;
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue;
    const block = b as Record<string, unknown>;
    const source = block.source as Record<string, unknown> | undefined;
    if (block.type === 'text' && typeof block.text === 'string') {
      if (block.text.trim()) blocks.push({ type: 'text', text: block.text.slice(0, MAX_TEXT) });
    } else if (block.type === 'image') {
      const mt = source?.media_type;
      const data = source?.data;
      if (
        source?.type === 'base64' &&
        typeof mt === 'string' &&
        ALLOWED_IMAGE_TYPES.has(mt) &&
        typeof data === 'string' &&
        data.length > 0 &&
        data.length <= MAX_IMAGE_B64 &&
        images < MAX_IMAGES
      ) {
        images++;
        blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data } });
      }
    } else if (block.type === 'document') {
      const data = source?.data;
      if (
        source?.type === 'base64' &&
        source?.media_type === 'application/pdf' &&
        typeof data === 'string' &&
        data.length > 0 &&
        data.length <= MAX_DOC_B64 &&
        docs < MAX_DOCS
      ) {
        docs++;
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
      }
    }
  }
  return blocks.length ? blocks : null;
}

// Filter to valid user/assistant turns, sanitize each, keep the last 20.
export function normalizeIncomingMessages(raw: unknown): AssistantMessage[] {
  const incoming = Array.isArray(raw) ? raw : [];
  return incoming
    .filter(
      (m): m is { role: string; content: unknown } =>
        !!m &&
        typeof m === 'object' &&
        'role' in m &&
        ((m as { role: string }).role === 'user' || (m as { role: string }).role === 'assistant'),
    )
    .map((m) => ({ role: m.role as AssistantRole, content: sanitizeContent(m.content) }))
    .filter((m): m is AssistantMessage => m.content !== null)
    .slice(-20);
}

// What the loop streams out: answer text as it's written, a marker each time
// Zordon reaches for a tool, and — for gated write tools — an `action` proposal
// the human must confirm before anything runs.
export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'action'; name: string; input: unknown };

export interface ToolLoopOptions {
  tools: Anthropic.Tool[];
  run: (name: string, input: unknown) => Promise<string>;
  maxSteps?: number;
  // Names of "proposal" tools: instead of running, the loop surfaces them as an
  // `action` event for the human to confirm, and tells the model it's pending.
  actionTools?: string[];
}

export const assistantConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (!cached) cached = new Anthropic();
  return cached;
}

// The brain: an agentic loop. Zordon reads live data through her tools, as many
// rounds as she needs, and we stream her answer text as it comes. Thinking
// blocks are preserved between turns (required for tool use with extended
// thinking); we never surface them to the client.
export async function* runAssistant(
  system: string,
  messages: AssistantMessage[],
  opts: ToolLoopOptions,
): AsyncGenerator<AssistantEvent> {
  const maxSteps = opts.maxSteps ?? 10;
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content as Anthropic.MessageParam['content'],
  }));

  for (let step = 0; step < maxSteps; step++) {
    const stream = client().messages.stream({
      model: ASSISTANT_MODEL,
      max_tokens: ASSISTANT_MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system,
      // Omit `tools` entirely when there are none (e.g. the background worker
      // reasoning over a prepared snapshot) rather than sending an empty array.
      ...(opts.tools.length ? { tools: opts.tools } : {}),
      messages: convo,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    convo.push({ role: 'assistant', content: final.content });

    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (final.stop_reason !== 'tool_use' || toolUses.length === 0) return;

    const actionSet = new Set(opts.actionTools ?? []);
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (actionSet.has(tu.name)) {
        // A gated write: propose it to the human, don't run it. Tell the model
        // it's pending so it wraps up instead of claiming success.
        yield { type: 'action', name: tu.name, input: tu.input };
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content:
            'Proposed to the user for confirmation. It has NOT run yet — the user will confirm or cancel it themselves. Tell them it is ready for their confirmation below; do not claim it is done or repeat the same proposal.',
        });
        continue;
      }
      yield { type: 'tool', name: tu.name };
      const out = await opts.run(tu.name, tu.input);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    convo.push({ role: 'user', content: results });
  }

  yield {
    type: 'text',
    text: '\n\n(I hit my analysis-step limit for this answer — ask me to keep going if you need more.)',
  };
}
