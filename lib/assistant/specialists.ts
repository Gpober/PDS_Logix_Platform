import type Anthropic from '@anthropic-ai/sdk';
import { runAssistant, type AssistantMessage } from './llm';

// The talent team. Zordon (the coordinator) delegates a focused brief to one of
// these specialists; each is a bounded sub-agent with its own instructions and a
// subset of the read tools, and reports back. Specialists never get the
// `delegate` tool (no recursion) and never take actions — reads only. The
// coordinator synthesizes their reports into one plan and owns the gate.

export interface Specialist {
  key: string;
  label: string;
  system: string;
  tools: string[]; // allowed tool names (a subset of the registry)
}

const VOICE =
  "Be concrete and quantitative — every claim tied to a number you actually pulled. Short, prioritized, plain USD. Don't invent data; if a tool returns nothing, say so.";

export const SPECIALISTS: Record<string, Specialist> = {
  growth_analyst: {
    key: 'growth_analyst',
    label: 'Growth Analyst',
    system:
      `You are the Growth Analyst on Tulips Talent's team. For the creator in the brief, read their Instagram stats, follower growth, and deal history, then give 3–5 specific, prioritized growth moves: posting cadence and formats, audience-fit observations, engagement quality vs. follower count, and which kinds of brands to target next. ${VOICE} If the creator hasn't connected Instagram, say that's the first move and work from deal history.`,
    tools: ['data_overview', 'list_talent', 'get_talent', 'get_instagram_stats', 'talent_performance', 'sales_analytics', 'search_deals'],
  },
  deal_matchmaker: {
    key: 'deal_matchmaker',
    label: 'Deal Matchmaker',
    system:
      `You are the Deal Matchmaker on Tulips Talent's team. Using the roster, the lead pipeline, and company history, surface the strongest brand↔creator pitch opportunities. Rank the top matches and give each a one-line rationale (category fit, audience, past deals). Flag leads that are due for a pitch. ${VOICE}`,
    tools: ['data_overview', 'list_leads', 'get_lead', 'search_companies', 'get_company', 'company_performance', 'list_talent', 'get_talent', 'get_instagram_stats', 'search_deals'],
  },
  content_strategist: {
    key: 'content_strategist',
    label: 'Content Strategist',
    system:
      `You are the Content Strategist on Tulips Talent's team. For the creator in the brief, propose a 2–4 week content plan — themes, formats, and cadence per platform — grounded in what's performed and their live brand deals, plus 2–3 sample captions in the creator's voice. ${VOICE}`,
    tools: ['data_overview', 'get_talent', 'get_instagram_stats', 'content_schedule', 'search_deals'],
  },
  performance_reviewer: {
    key: 'performance_reviewer',
    label: 'Performance Reviewer',
    system:
      `You are the Performance Reviewer on Tulips Talent's team. Produce a concise monthly review for the creator in the brief: deals and revenue, engagement trend, the month's wins, and 2–3 concrete things to change next month. Make it shareable. ${VOICE}`,
    tools: ['data_overview', 'get_talent', 'get_instagram_stats', 'talent_performance', 'sales_analytics', 'search_deals'],
  },
};

export const SPECIALIST_KEYS = Object.keys(SPECIALISTS);

// Run one specialist against a brief and return its report text. Reuses the
// main tool loop (draining it to completion); the caller passes the shared tool
// registry so this module doesn't import tools.ts (avoids an import cycle).
export async function runSpecialist(
  key: string,
  brief: string,
  registry: { tools: Anthropic.Tool[]; run: (name: string, input: unknown) => Promise<string> },
): Promise<{ specialist: string; label: string; report: string } | { error: string }> {
  const spec = SPECIALISTS[key];
  if (!spec) return { error: `Unknown specialist "${key}". Options: ${SPECIALIST_KEYS.join(', ')}.` };

  const tools = registry.tools.filter((t) => spec.tools.includes(t.name));
  const messages: AssistantMessage[] = [{ role: 'user', content: brief }];

  let out = '';
  for await (const ev of runAssistant(spec.system, messages, { tools, run: registry.run, maxSteps: 6 })) {
    if (ev.type === 'text') out += ev.text;
  }
  return { specialist: spec.key, label: spec.label, report: out.trim() || 'No output.' };
}
