// The daily piecework report — yesterday / this week / this month, in pieces and
// revenue, split into Piecework and Photo Dept.
//
// This is the email that used to be assembled by a Claude Routine calling the
// synced copy of Connecteam. Building it here instead means it reads the same
// source layer as every other production number (Connecteam live for a recent
// window, the stored copy as backup), it carries its own staleness warning, and
// the numbers and the template are version-controlled together rather than
// living in a prompt nobody can diff.
//
// The arithmetic rules are carried over verbatim from
// docs/daily-production-email/render_preview.py, which reads the same
// template.html. Any change to either belongs in both.

import fs from 'node:fs';
import path from 'node:path';
import { readProduction, type ProductionRead } from './source';
import { lateArrivals, type LateArrivals } from './reconcile';
import type { ProductionRow } from '@/lib/connecteam/client';

// The photo department, by name. Everyone else the report returns is piecework —
// never a hardcoded piecework list, so a new hire cannot silently go missing.
export const PHOTO_SIX = [
  'Esthefany Delgado',
  'Blanca Tinoco',
  'Andriu Gonzalez',
  'Jean Clauda Richard',
  'Dariany Tua',
  'Jean Ernst Petit',
];

// BILLING prices per piece — not the workers' pay rates. An unpriced location
// shows pieces with an empty revenue cell, never a guess.
export const CRS_PRICE: Record<string, number> = {
  'Manheim Dallas': 19.5,
  'Manheim DFW': 19.5,
  'Manheim Atlanta': 21.0,
};
export const PHOTO_PRICE = 5.0;

const TINTS: Record<'piecework' | 'photo', [string, string, string, string]> = {
  piecework: ['#F9FBFF', '#F9FEFB', '#FFFCF8', '#D97706'],
  photo: ['#F8FAFF', '#F7FEFB', '#FFFCF8', '#4F46E5'],
};

// 760.5 -> 761. JavaScript's Math.round already rounds half away from zero for
// positives, but be explicit: this is the rule the approved design depends on,
// and each TOTALS figure is the sum of the ROUNDED rows so every column visibly
// adds up on screen.
const halfUp = (x: number) => Math.floor(x + 0.5);
const money = (n: number) => '$' + Math.trunc(n).toLocaleString('en-US');
const comma = (n: number) => n.toLocaleString('en-US');

export interface WorkerRow {
  name: string;
  location: string;
  day: number;
  week: number;
  month: number;
}

// ---- HTML escaping ---------------------------------------------------------
// Worker names and locations come from Connecteam form answers, i.e. from
// outside this codebase. They are interpolated into HTML, so they get escaped —
// an apostrophe in a name should render, not break the row.
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- periods ---------------------------------------------------------------

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The three windows the email reports, all relative to `asOf` (yesterday).
 * Week runs Monday-to-yesterday; month runs from the 1st to yesterday — both
 * inclusive, matching what the email has always shown.
 */
export function reportPeriods(asOf: string) {
  const d = new Date(`${asOf}T00:00:00Z`);
  // getUTCDay: 0=Sun. Monday-based week, so Sunday closes the prior week.
  const dow = d.getUTCDay();
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = new Date(d.getTime() - backToMonday * 86400_000);
  const monthStart = `${asOf.slice(0, 7)}-01`;
  return {
    day: { from: asOf, to: asOf },
    week: { from: ymd(weekStart), to: asOf },
    month: { from: monthStart, to: asOf },
  };
}

// ---- data ------------------------------------------------------------------

const nameKey = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

function tally(rows: ProductionRow[]): Map<string, { count: number; locations: Map<string, number> }> {
  const out = new Map<string, { count: number; locations: Map<string, number> }>();
  for (const r of rows) {
    const name = nameKey(r.staff_name);
    if (!name) continue;
    let b = out.get(name);
    if (!b) {
      b = { count: 0, locations: new Map() };
      out.set(name, b);
    }
    b.count += 1;
    b.locations.set(r.location, (b.locations.get(r.location) ?? 0) + 1);
  }
  return out;
}

export interface ReportData {
  asOf: string;
  workers: WorkerRow[];
  reads: { day: Omit<ProductionRead, 'rows'>; week: Omit<ProductionRead, 'rows'>; month: Omit<ProductionRead, 'rows'> };
  /** Non-empty means the numbers below may be a broken pipe rather than a slow
   *  day. Rendered as the red banner. */
  warnings: string[];
  /** What the live read caught that the nightly copy has not got yet. Null when
   *  the comparison could not be made at all. */
  late: LateArrivals | null;
}

/**
 * Gather the three periods. The month read is a superset of the other two, but
 * each is fetched on its own so a degraded read on one window is reported
 * against that window rather than silently widening.
 */
export async function collectReport(asOf: string): Promise<ReportData> {
  const periods = reportPeriods(asOf);

  const [dayRead, weekRead, monthRead] = await Promise.all([
    readProduction(periods.day),
    readProduction(periods.week),
    readProduction(periods.month),
  ]);

  const day = tally(dayRead.rows);
  const week = tally(weekRead.rows);
  const month = tally(monthRead.rows);

  // Everyone who appears in ANY period, plus the photo six who are always
  // listed even at zero.
  const names = new Set<string>([...month.keys(), ...week.keys(), ...day.keys(), ...PHOTO_SIX]);

  const workers: WorkerRow[] = [...names].map((name) => {
    // Location for the subline: where this person logged the most units over the
    // longest window we have. A worker who moved sites mid-month shows where the
    // bulk of the work happened rather than an arbitrary row's answer.
    const locs = month.get(name)?.locations ?? week.get(name)?.locations ?? day.get(name)?.locations;
    const location = locs && locs.size
      ? [...locs.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : 'Manheim';
    return {
      name,
      location,
      day: day.get(name)?.count ?? 0,
      week: week.get(name)?.count ?? 0,
      month: month.get(name)?.count ?? 0,
    };
  });

  const warnings: string[] = [];
  const dow = new Date(`${asOf}T00:00:00Z`).getUTCDay();
  const isWeekday = dow >= 1 && dow <= 5;
  const dayTotal = workers.reduce((a, w) => a + w.day, 0);
  if (isWeekday && dayTotal === 0) {
    warnings.push(`No production recorded for ${asOf}, a weekday. Verify before acting on these figures.`);
  }
  for (const [label, read] of [['Yesterday', dayRead], ['This week', weekRead], ['This month', monthRead]] as const) {
    if (read.degraded) {
      warnings.push(
        `${label}'s figures came from the synced copy, not Connecteam itself${read.reason ? ` (${read.reason})` : ''}.`,
      );
    }
  }

  // What did reading live actually buy us today? People log units after the
  // sync runs, and on the copy alone those units are invisible — indistinguish-
  // able from a quiet afternoon. Measure it so the report can show it.
  let late: LateArrivals | null = null;
  try {
    late = await lateArrivals({ from: periods.day.from, to: periods.day.to, sampleLimit: 25 });
    if (late.reliable && late.goneFromConnecteam > 0) {
      warnings.push(
        `${late.goneFromConnecteam} unit${late.goneFromConnecteam === 1 ? '' : 's'} in the nightly copy no longer exist in Connecteam and have been excluded.`,
      );
    }
  } catch {
    // A failed comparison must never block the report; it just means we cannot
    // show the live-vs-copy delta this run.
    late = null;
  }

  const strip = (r: ProductionRead) => {
    const { rows: _rows, ...meta } = r;
    return meta;
  };
  return {
    asOf,
    workers,
    reads: { day: strip(dayRead), week: strip(weekRead), month: strip(monthRead) },
    warnings,
    late,
  };
}

// ---- rendering -------------------------------------------------------------

function pair(pieces: number, revenue: number, tint: string, revcolour: string): string {
  const base = `background-color:${tint};padding:12px 14px;font-family:Consolas,Menlo,monospace;`;
  if (!pieces) {
    const muted = `<td align="right" style="${base}color:#94A3B8;">&mdash;</td>`;
    return muted + muted;
  }
  return (
    `<td align="right" style="${base}color:#1A2332;">${comma(pieces)}</td>` +
    `<td align="right" style="${base}font-weight:700;color:${revcolour};">${money(revenue)}</td>`
  );
}

/** Rows HTML plus [day_pc, day_rev, week_pc, week_rev, month_pc, month_rev]. */
function section(rows: WorkerRow[], kind: 'piecework' | 'photo'): { html: string; totals: number[]; unpriced: string[] } {
  const [dayTint, weekTint, monthTint, revcolour] = TINTS[kind];
  const tints = [dayTint, weekTint, monthTint];
  const totals = [0, 0, 0, 0, 0, 0];
  const unpriced = new Set<string>();
  const out: string[] = [];

  // Yesterday desc, then month desc — the approved row order.
  const sorted = [...rows].sort((a, b) => b.day - a.day || b.month - a.month);
  for (const r of sorted) {
    const rate = kind === 'photo' ? PHOTO_PRICE : CRS_PRICE[r.location];
    if (rate == null) unpriced.add(r.location);
    const subline =
      kind === 'photo' || rate == null ? esc(r.location) : `${esc(r.location)} &middot; $${rate.toFixed(2)}/pc`;
    const counts = [r.day, r.week, r.month];
    const revs = counts.map((c) => (rate == null ? 0 : halfUp(c * rate)));
    for (let i = 0; i < 3; i++) {
      totals[i * 2] += counts[i];
      totals[i * 2 + 1] += revs[i];
    }
    const cells = counts.map((c, i) => pair(c, revs[i], tints[i], revcolour)).join('\n    ');
    out.push(
      '  <tr>\n' +
        '    <td style="padding:12px 14px 12px 24px;border-bottom:1px solid #E2E8F0;">' +
        `<div style="font-weight:600;color:#1A2332;font-size:13px;">${esc(r.name)}</div>` +
        '<div style="font-size:11px;color:#94A3B8;font-family:Consolas,Menlo,monospace;padding-top:2px;">' +
        `${subline}</div></td>\n` +
        `    ${cells}\n` +
        '  </tr>',
    );
  }
  return { html: out.join('\n'), totals, unpriced: [...unpriced].sort() };
}

/** The live-capture line. Deliberately NOT a warning: units arriving after the
 *  sync is the normal case, and catching them is the point of reading live. It
 *  belongs in the footer as provenance, not in the red block as an alarm. */
function liveNote(late: LateArrivals | null): string {
  if (!late) return '';
  if (!late.reliable) {
    return ' &middot; live-vs-copy check did not complete this run';
  }
  if (late.capturedLive > 0) {
    const n = late.capturedLive;
    return ` &middot; <strong style="color:#15803D;">${n} unit${n === 1 ? '' : 's'} logged after the last sync, caught by the live read</strong>`;
  }
  return ' &middot; live read matched the nightly copy exactly';
}

function banner(warnings: string[]): string {
  if (!warnings.length) return '';
  const items = warnings.map((w) => `<div style="padding-top:4px;">${esc(w)}</div>`).join('');
  return (
    '<tr><td style="padding:0 24px 16px 24px;">' +
    '<div style="background-color:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;' +
    'padding:12px 14px;color:#991B1B;font-size:12px;line-height:1.5;">' +
    '<strong style="display:block;font-size:13px;">Check before acting on these numbers</strong>' +
    items +
    '</div></td></tr>'
  );
}

// One template, shared with render_preview.py. next.config.mjs force-includes it
// in the serverless bundle — see outputFileTracingIncludes; without that the
// file is absent at runtime on Vercel even though it is in the repo.
function loadTemplate(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'docs', 'daily-production-email', 'template.html'),
    'utf8',
  );
}

export interface RenderedReport {
  html: string;
  subject: string;
  late: LateArrivals | null;
  totals: { piecework: number[]; photo: number[] };
  unpriced: string[];
  warnings: string[];
}

export function renderReport(data: ReportData): RenderedReport {
  const photoRows = data.workers.filter((w) => PHOTO_SIX.includes(w.name));
  const crsRows = data.workers.filter((w) => !PHOTO_SIX.includes(w.name));
  const pw = section(crsRows, 'piecework');
  const ph = section(photoRows, 'photo');

  let html = loadTemplate()
    .replace('<!-- PIECEWORK_ROWS -->', pw.html)
    .replace('<!-- PHOTO_ROWS -->', ph.html)
    .replace('<!-- WARNING_BANNER -->', banner(data.warnings))
    // Provenance in the footer: which source served this, and what reading live
    // caught that the copy had not.
    .replace('&middot; synced nightly', `&middot; ${data.reads.day?.live ? 'read live from Connecteam' : 'from the nightly synced copy'}${liveNote(data.late)}`);

  const asOfLabel = new Date(`${data.asOf}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const values: Record<string, string> = {
    AS_OF: asOfLabel,
    DAY_CRS: money(pw.totals[1]),
    DAY_PHOTO: money(ph.totals[1]),
    WEEK_CRS: money(pw.totals[3]),
    WEEK_PHOTO: money(ph.totals[3]),
    MONTH_CRS: money(pw.totals[5]),
    MONTH_PHOTO: money(ph.totals[5]),
  };
  const keys = ['D_PC', 'D_REV', 'W_PC', 'W_REV', 'M_PC', 'M_REV'];
  keys.forEach((key, i) => {
    values[`PW_${key}`] = key.includes('PC') ? comma(pw.totals[i]) : money(pw.totals[i]);
    values[`PH_${key}`] = key.includes('PC') ? comma(ph.totals[i]) : money(ph.totals[i]);
  });
  for (const [key, value] of Object.entries(values)) {
    html = html.split('{{' + key + '}}').join(value);
  }
  if (html.includes('{{')) {
    throw new Error('unfilled placeholder left in template');
  }

  const pieces = pw.totals[0] + ph.totals[0];
  return {
    html,
    subject: `PDS Daily Production — ${asOfLabel} — ${comma(pieces)} pieces`,
    late: data.late,
    totals: { piecework: pw.totals, photo: ph.totals },
    unpriced: [...new Set([...pw.unpriced, ...ph.unpriced])],
    warnings: data.warnings,
  };
}

/** Yesterday, in US Central — the day the report is about. */
export function yesterdayCentral(now = new Date()): string {
  const central = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  central.setDate(central.getDate() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${central.getFullYear()}-${pad(central.getMonth() + 1)}-${pad(central.getDate())}`;
}

export async function buildDailyReport(asOf?: string): Promise<RenderedReport & { data: ReportData }> {
  const day = asOf ?? yesterdayCentral();
  const data = await collectReport(day);
  return { ...renderReport(data), data };
}
