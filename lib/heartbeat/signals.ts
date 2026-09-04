// lib/heartbeat/signals.ts
//
// What the heartbeat looks at.
//
// Signals are computed in CODE, against thresholds, before the model is
// involved. That ordering is deliberate: the model's job is to decide which of
// these — if any — deserve the owner's attention today, not to go fishing
// through the business for something to say. A loop that hands an LLM the
// whole database and asks "anything interesting?" will always find something,
// which is the same as finding nothing.
//
// Every signal carries the rows behind it, so a brief can be checked.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Days a completed job may sit un-invoiced before it is worth mentioning. */
const INVOICE_LAG_DAYS = 3;
/** Days a job may sit in progress past its scheduled date before it is stale. */
const STALE_JOB_DAYS = 5;
/** Days a new lead may sit untouched before it is worth mentioning. */
const LEAD_AGE_DAYS = 4;

export interface Signal {
  kind: string;
  /** One line, already written for a human. */
  line: string;
  /** The magnitude that made it a signal — dollars or a count. */
  value: number;
  unit: 'usd' | 'count';
  /** The rows behind it, so the claim can be checked. */
  detail: string[];
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

/** How many whole days ago a YYYY-MM-DD date was. */
function ageInDays(day: string | null): number | null {
  if (!day) return null;
  const then = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export async function computeSignals(sb: SupabaseClient): Promise<Signal[]> {
  const signals: Signal[] = [];

  // ---- Work finished but never billed -------------------------------------
  // The most expensive thing a field-service business does to itself.
  const { data: uninvoiced } = await sb
    .from('jobs')
    .select('id, service_type, completed_date, clients(name), job_pricing(price)')
    .eq('status', 'completed')
    .is('qbo_invoice_id', null)
    .lte('completed_date', daysAgo(INVOICE_LAG_DAYS))
    .order('completed_date', { ascending: true })
    .limit(50);

  if (uninvoiced?.length) {
    const total = uninvoiced.reduce(
      (sum: number, j: any) => sum + Number(j.job_pricing?.price ?? 0),
      0,
    );
    signals.push({
      kind: 'completed_not_invoiced',
      line: `${uninvoiced.length} completed job${uninvoiced.length === 1 ? '' : 's'} not invoiced${total ? `, worth ${usd(total)}` : ''} — oldest finished ${ageInDays((uninvoiced[0] as any).completed_date)} days ago.`,
      value: total || uninvoiced.length,
      unit: total ? 'usd' : 'count',
      detail: uninvoiced.slice(0, 10).map((j: any) => {
        const age = ageInDays(j.completed_date);
        return `${j.clients?.name ?? 'Unknown client'} · ${j.service_type}${j.job_pricing?.price ? ` · ${usd(Number(j.job_pricing.price))}` : ''}${age != null ? ` · ${age}d` : ''}`;
      }),
    });
  }

  // ---- Invoiced and still unpaid -----------------------------------------
  const { data: unpaid } = await sb
    .from('jobs')
    .select('id, qbo_balance, qbo_invoice_status, completed_date, clients(name)')
    .gt('qbo_balance', 0)
    .order('qbo_balance', { ascending: false })
    .limit(50);

  if (unpaid?.length) {
    const total = unpaid.reduce((sum: number, j: any) => sum + Number(j.qbo_balance ?? 0), 0);
    signals.push({
      kind: 'invoiced_unpaid',
      line: `${usd(total)} invoiced and unpaid across ${unpaid.length} job${unpaid.length === 1 ? '' : 's'}.`,
      value: total,
      unit: 'usd',
      detail: unpaid.slice(0, 10).map((j: any) =>
        `${j.clients?.name ?? 'Unknown client'} · ${usd(Number(j.qbo_balance))}${j.qbo_invoice_status ? ` · ${j.qbo_invoice_status}` : ''}`,
      ),
    });
  }

  // ---- Started and stalled ------------------------------------------------
  const { data: stale } = await sb
    .from('jobs')
    .select('id, service_type, scheduled_date, clients(name)')
    .eq('status', 'in_progress')
    .lte('scheduled_date', daysAgo(STALE_JOB_DAYS))
    .order('scheduled_date', { ascending: true })
    .limit(50);

  if (stale?.length) {
    signals.push({
      kind: 'stale_in_progress',
      line: `${stale.length} job${stale.length === 1 ? '' : 's'} still in progress more than ${STALE_JOB_DAYS} days past the scheduled date.`,
      value: stale.length,
      unit: 'count',
      detail: stale.slice(0, 10).map((j: any) => {
        const age = ageInDays(j.scheduled_date);
        return `${j.clients?.name ?? 'Unknown client'} · ${j.service_type}${age != null ? ` · scheduled ${age}d ago` : ''}`;
      }),
    });
  }

  // ---- Scheduled, past due, not started -----------------------------------
  const { data: overdue } = await sb
    .from('jobs')
    .select('id, service_type, scheduled_date, status, clients(name)')
    .in('status', ['requested', 'scheduled'])
    .lt('scheduled_date', today())
    .order('scheduled_date', { ascending: true })
    .limit(50);

  if (overdue?.length) {
    signals.push({
      kind: 'overdue_scheduled',
      line: `${overdue.length} job${overdue.length === 1 ? '' : 's'} scheduled for a date that has passed and not started.`,
      value: overdue.length,
      unit: 'count',
      detail: overdue.slice(0, 10).map((j: any) =>
        `${j.clients?.name ?? 'Unknown client'} · ${j.service_type} · ${j.scheduled_date} · ${j.status}`,
      ),
    });
  }

  // ---- Leads nobody has touched ------------------------------------------
  const { data: leads } = await sb
    .from('leads')
    .select('id, name, company, service_type, created_at, source')
    .eq('status', 'new')
    .lte('created_at', `${daysAgo(LEAD_AGE_DAYS)}T23:59:59Z`)
    .order('created_at', { ascending: true })
    .limit(200);

  if (leads?.length) {
    signals.push({
      kind: 'unworked_leads',
      line: `${leads.length} lead${leads.length === 1 ? '' : 's'} still marked new after ${LEAD_AGE_DAYS}+ days.`,
      value: leads.length,
      unit: 'count',
      detail: leads.slice(0, 10).map((l: any) => {
        const age = ageInDays(String(l.created_at).slice(0, 10));
        return `${l.name}${l.company ? ` (${l.company})` : ''}${l.service_type ? ` · ${l.service_type}` : ''}${age != null ? ` · ${age}d` : ''}`;
      }),
    });
  }

  return signals;
}

/** The signals as the model sees them: lines plus the rows behind each. */
export function signalsToText(signals: Signal[]): string {
  if (!signals.length) return 'No signals crossed a threshold.';
  return signals
    .map((s) => [`${s.line}`, ...s.detail.map((d) => `    · ${d}`)].join('\n'))
    .join('\n\n');
}
