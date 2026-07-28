import type { ReportBlock } from '@/lib/crm/types';

type Json = Record<string, unknown>;

// The shared `build_report` tool input schema and block normalizer. Zordon
// gathers real numbers with her read tools, then calls build_report with an
// ordered list of blocks; this validates and shapes them for storage + render.

export const BUILD_REPORT_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'Report title, e.g. "PDS Logix — March Operations".' },
    summary: { type: 'string', description: 'One or two sentences — the headline takeaway.' },
    blocks: {
      type: 'array',
      description: 'Ordered report blocks.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['kpis', 'bar', 'line', 'table', 'callout', 'text'] },
          title: { type: 'string', description: 'Section/chart title (bar, line, table).' },
          unit: { type: 'string', description: 'Optional unit hint, e.g. "$" or "%".' },
          heading: { type: 'string', description: 'Heading for a text block.' },
          body: { type: 'string', description: 'Body for a text block.' },
          text: { type: 'string', description: 'Text for a callout.' },
          tone: { type: 'string', enum: ['ink', 'positive', 'negative', 'warning', 'info'], description: 'Callout/kpi tone.' },
          items: {
            type: 'array',
            description: 'For kpis: the tiles.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'string', description: 'Preformatted, e.g. "$48,600" or "78.4%".' },
                tone: { type: 'string', enum: ['ink', 'positive', 'negative', 'warning', 'info'] },
              },
              required: ['label', 'value'],
            },
          },
          series: {
            type: 'array',
            description: 'For bar: {label, value} pairs.',
            items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } }, required: ['label', 'value'] },
          },
          points: {
            type: 'array',
            description: 'For line: {label, value} points in time order.',
            items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' } }, required: ['label', 'value'] },
          },
          columns: { type: 'array', description: 'For table: column headers.', items: { type: 'string' } },
          rows: { type: 'array', description: 'For table: rows of cell strings.', items: { type: 'array', items: { type: 'string' } } },
        },
        required: ['type'],
      },
    },
  },
  required: ['title', 'blocks'],
};

// Normalize a `build_report` tool input into a title/summary/blocks payload.
// Drops malformed blocks rather than failing; returns an error only when there's
// no title or nothing renderable.
export function normalizeReportInput(
  input: Json,
): { title: string; summary: string | null; blocks: ReportBlock[] } | { error: string } {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return { error: 'A report needs a title.' };
  const rawBlocks = Array.isArray(input.blocks) ? input.blocks : [];

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const TONES = ['ink', 'positive', 'negative', 'warning', 'info'] as const;
  type Tone = (typeof TONES)[number];
  const toneOf = (v: unknown): Tone | undefined => (TONES.includes(v as Tone) ? (v as Tone) : undefined);
  const pts = (arr: unknown) =>
    (Array.isArray(arr) ? arr : [])
      .map((p) => (p && typeof p === 'object' ? { label: String((p as Json).label ?? ''), value: num((p as Json).value) } : null))
      .filter((p): p is { label: string; value: number } => !!p && p.label !== '');

  const blocks: ReportBlock[] = [];
  for (const b of rawBlocks as Json[]) {
    const t = String(b?.type ?? '');
    if (t === 'text' && typeof b.body === 'string') blocks.push({ type: 'text', heading: b.heading ? String(b.heading) : undefined, body: b.body });
    else if (t === 'callout' && typeof b.text === 'string') blocks.push({ type: 'callout', tone: toneOf(b.tone), text: b.text });
    else if (t === 'kpis' && Array.isArray(b.items))
      blocks.push({
        type: 'kpis',
        items: (b.items as Json[])
          .filter((i) => i && typeof i.label === 'string' && i.value != null)
          .map((i) => ({ label: String(i.label), value: String(i.value), tone: toneOf(i.tone) })),
      });
    else if (t === 'bar') blocks.push({ type: 'bar', title: b.title ? String(b.title) : undefined, unit: b.unit ? String(b.unit) : undefined, series: pts(b.series) });
    else if (t === 'line') blocks.push({ type: 'line', title: b.title ? String(b.title) : undefined, unit: b.unit ? String(b.unit) : undefined, points: pts(b.points) });
    else if (t === 'table' && Array.isArray(b.columns))
      blocks.push({
        type: 'table',
        title: b.title ? String(b.title) : undefined,
        columns: (b.columns as unknown[]).map(String),
        rows: (Array.isArray(b.rows) ? b.rows : []).map((r) => (Array.isArray(r) ? r.map(String) : [])),
      });
  }

  if (blocks.length === 0) {
    return { error: 'No valid report blocks — include at least one kpis/bar/line/table/callout/text block.' };
  }
  return { title, summary: typeof input.summary === 'string' ? input.summary : null, blocks };
}
