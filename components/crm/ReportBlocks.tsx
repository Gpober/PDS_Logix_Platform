import type { ReportBlock, ReportTone } from '@/lib/crm/types';

const TONE_HEX: Record<ReportTone, string> = {
  ink: '#F2F5F8',
  positive: '#4ADE80',
  negative: '#F87171',
  warning: '#FBBF24',
  info: '#16B4E8',
};

const BAR = '#16B4E8';
const LINE = '#5AB6D8';

const nf = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

function Kpis({ items }: { items: Extract<ReportBlock, { type: 'kpis' }>['items'] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((k, i) => (
        <div key={i} className="rounded-2xl border border-line bg-white p-5 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone">{k.label}</div>
          <div className="mt-2 font-display text-2xl" style={{ color: TONE_HEX[k.tone ?? 'ink'] }}>
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bars({ block }: { block: Extract<ReportBlock, { type: 'bar' }> }) {
  const max = Math.max(1, ...block.series.map((s) => Math.abs(s.value)));
  return (
    <div>
      {block.title && <h3 className="mb-3 font-display text-lg">{block.title}</h3>}
      <div className="space-y-2.5">
        {block.series.map((s, i) => (
          <div key={i} className="rounded-xl border border-line bg-white p-3">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-ink">{s.label}</span>
              <span className="shrink-0 tabular-nums text-stone">
                {block.unit === '$' ? '$' : ''}
                {nf(s.value)}
                {block.unit && block.unit !== '$' ? block.unit : ''}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-blush">
              <div className="h-full rounded-full" style={{ width: `${(Math.abs(s.value) / max) * 100}%`, background: BAR }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ block }: { block: Extract<ReportBlock, { type: 'line' }> }) {
  const pts = block.points;
  if (pts.length < 2) return <Bars block={{ type: 'bar', title: block.title, unit: block.unit, series: pts }} />;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 640;
  const H = 180;
  const pad = 8;
  const x = (i: number) => pad + (i * (W - pad * 2)) / (pts.length - 1);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = `${d} L ${x(pts.length - 1).toFixed(1)} ${H - pad} L ${x(0).toFixed(1)} ${H - pad} Z`;

  return (
    <div>
      {block.title && <h3 className="mb-3 font-display text-lg">{block.title}</h3>}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
          <path d={area} fill={LINE} opacity="0.08" />
          <path d={d} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.value)} r="2.5" fill={LINE} />
          ))}
        </svg>
        <div className="mt-2 flex justify-between text-[11px] text-stone">
          {pts.map((p, i) => (
            <span key={i} className="tabular-nums">
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DataTable({ block }: { block: Extract<ReportBlock, { type: 'table' }> }) {
  return (
    <div>
      {block.title && <h3 className="mb-3 font-display text-lg">{block.title}</h3>}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wider text-stone">
            <tr>
              {block.columns.map((c, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i} className="border-t border-line hover:bg-blush/30">
                {r.map((cell, j) => (
                  <td key={j} className={'px-3 py-2 ' + (j === 0 ? 'font-medium text-ink' : 'text-stone')}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReportBlocks({ blocks }: { blocks: ReportBlock[] }) {
  return (
    <div className="space-y-8">
      {blocks.map((b, i) => {
        if (b.type === 'kpis') return <Kpis key={i} items={b.items} />;
        if (b.type === 'bar') return <Bars key={i} block={b} />;
        if (b.type === 'line') return <LineChart key={i} block={b} />;
        if (b.type === 'table') return <DataTable key={i} block={b} />;
        if (b.type === 'callout')
          return (
            <div
              key={i}
              className="rounded-2xl border-l-4 bg-white p-4 text-sm"
              style={{ borderColor: TONE_HEX[b.tone ?? 'info'], color: '#F2F5F8' }}
            >
              {b.text}
            </div>
          );
        return (
          <div key={i}>
            {b.heading && <h3 className="mb-1.5 font-display text-lg">{b.heading}</h3>}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{b.body}</p>
          </div>
        );
      })}
    </div>
  );
}
