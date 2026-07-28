import { runAssistant } from '../lib/assistant/llm';
import { SPECIALISTS } from '../lib/assistant/specialists';

// Run one specialist over a prepared text snapshot (no live tools — the worker
// gathered the data already). Reuses the specialist personas from
// lib/assistant/specialists.ts so the crew reads the same in chat and here.
export async function runSpecialistOverSnapshot(
  key: string,
  brief: string,
  snapshot: string,
): Promise<{ specialist: string; label: string; report: string }> {
  const spec = SPECIALISTS[key];
  if (!spec) return { specialist: key, label: key, report: `Unknown specialist "${key}".` };

  const system =
    `${spec.system}\n\nYou are running in the background over a prepared data snapshot — you have no live tools this run, so work ONLY from the snapshot below. If a figure isn't in it, say so rather than inventing one.`;
  const user = `BRIEF: ${brief || 'Review the business and give a prioritized plan.'}\n\n=== BUSINESS SNAPSHOT ===\n${snapshot}`;

  let out = '';
  for await (const ev of runAssistant(system, [{ role: 'user', content: user }], {
    tools: [],
    run: async () => '{}',
    maxSteps: 1,
  })) {
    if (ev.type === 'text') out += ev.text;
  }
  return { specialist: spec.key, label: spec.label, report: out.trim() || 'No output.' };
}
