import Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_MAX_TOKENS, ASSISTANT_MODEL } from './config';

// The provider seam. Everything model-specific lives here so the rest of the
// assistant talks to one small interface — swap Claude for anything in this
// file alone. Server-only: the API key never reaches the browser.

export type AssistantRole = 'user' | 'assistant';
export interface AssistantMessage {
  role: AssistantRole;
  content: string;
}

// What the loop streams out: answer text as it's written, plus a marker each
// time Zordon reaches for a tool (so the UI can show what she's reading).
export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string };

export interface ToolLoopOptions {
  tools: Anthropic.Tool[];
  run: (name: string, input: unknown) => Promise<string>;
  maxSteps?: number;
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
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let step = 0; step < maxSteps; step++) {
    const stream = client().messages.stream({
      model: ASSISTANT_MODEL,
      max_tokens: ASSISTANT_MAX_TOKENS,
      thinking: { type: 'adaptive' },
      system,
      tools: opts.tools,
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

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
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
