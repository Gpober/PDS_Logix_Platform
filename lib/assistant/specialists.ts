import type Anthropic from '@anthropic-ai/sdk';
import { runAssistant, type AssistantMessage } from './llm';

// Zordon's operations crew. Zordon (the coordinator) delegates a focused brief
// to one of these specialists; each is a bounded sub-agent with its own
// instructions and a subset of the read tools, and reports back. Specialists
// never get the `delegate` tool (no recursion) and never take actions — reads
// only. The coordinator synthesizes their reports into one plan and owns the
// confirmation gate.

export interface Specialist {
  key: string;
  label: string;
  system: string;
  tools: string[]; // allowed tool names (a subset of the registry)
}

const VOICE =
  "Be concrete and quantitative — every claim tied to a number you actually pulled. Short, prioritized, plain USD. Don't invent data; if a tool returns nothing, say so.";

export const SPECIALISTS: Record<string, Specialist> = {
  operations_analyst: {
    key: 'operations_analyst',
    label: 'Operations Analyst',
    system:
      `You are the Operations Analyst on PDS Logix's team — a vehicle field-service business (condition reports, detailing, biohazard). For the scope in the brief, read the jobs pipeline, statuses, pricing/margin, and staff, then give 3–5 specific, prioritized operational moves: where jobs are stuck (requested/scheduled aging), margin leaks (price vs cost), staff/asset throughput, and what to invoice next. ${VOICE}`,
    tools: ['data_overview', 'list_jobs', 'get_job', 'list_staff', 'list_assets', 'job_analytics'],
  },
  pipeline_strategist: {
    key: 'pipeline_strategist',
    label: 'Pipeline Strategist',
    system:
      `You are the Pipeline Strategist on PDS Logix's team. Using the inbound lead pipeline, clients, and job history, surface where the next revenue is: which leads to follow up now, which clients are due for repeat work, and the strongest conversion opportunities. Rank them with a one-line rationale each. ${VOICE}`,
    tools: ['data_overview', 'list_leads', 'get_lead', 'list_clients', 'get_client', 'client_performance', 'list_jobs'],
  },
  client_manager: {
    key: 'client_manager',
    label: 'Client Manager',
    system:
      `You are the Client Manager on PDS Logix's team. For the client in the brief, produce a concise account review: their jobs and spend, service mix, what's outstanding/invoiced, and 2–3 concrete retention or upsell moves (more service types, more assets covered, faster turnaround). ${VOICE}`,
    tools: ['data_overview', 'get_client', 'list_clients', 'client_performance', 'list_jobs', 'get_job'],
  },
  quality_reviewer: {
    key: 'quality_reviewer',
    label: 'Quality Reviewer',
    system:
      `You are the Quality Reviewer on PDS Logix's team. For the scope in the brief, review completed jobs and their condition reports for consistency and completeness: missing grades/notes/photos, jobs completed without a report, and turnaround from scheduled to completed. Flag the specific jobs and give 2–3 process fixes. ${VOICE}`,
    tools: ['data_overview', 'list_jobs', 'get_job'],
  },
  outreach_writer: {
    key: 'outreach_writer',
    label: 'Outreach Writer',
    system:
      `You are the Outreach Writer on PDS Logix's team. Given a lead or a client in the brief, read the lead (get_lead) and any relevant job history, then WRITE one ready-to-send follow-up or service-quote email in a warm, professional, plain-spoken voice — subject line and full body, grounded in what the lead asked for and what PDS Logix does. Keep it tight (under ~150 words unless told otherwise). Return exactly:\nSUBJECT: <subject>\n\n<body>\nYou do not send or save anything — the coordinator saves it as a draft. ${VOICE}`,
    tools: ['data_overview', 'get_lead', 'list_leads', 'get_client', 'list_clients', 'list_jobs'],
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
