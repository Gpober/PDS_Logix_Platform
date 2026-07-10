'use client';

import { useState } from 'react';
import type { MonthEarning, MonthCadence, DayFollowers } from '@/lib/crm/analytics';

// Brand palette (validated: paid↔owed CVD ΔE 19.2, published↔planned 54.4).
const C = {
  paid: '#5B8C5A',
  owed: '#BE9197',
  published: '#1A1816',
  planned: '#BE9197',
  line: '#9E6F76',
  grid: '#E7DBCD',
  stone: '#7C726C',
};

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtCount = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
      : `${n}`;

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
};

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-stone">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 text-center sm:p-6">
      <p className="eyebrow">{eyebrow}</p>
      <h3 className="mt-1 font-display text-xl">{title}</h3>
      {children}
    </section>
  );
}

// ---- Monthly earnings (stacked bars: paid + on-the-way) ----------------------
function MoneyChart({ data }: { data: MonthEarning[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, m) => s + m.booked, 0);
  const paidTotal = data.reduce((s, m) => s + m.paid, 0);
  const owedTotal = data.reduce((s, m) => s + m.owed, 0);

  if (total <= 0) {
    return (
      <Card eyebrow="Earnings" title="Monthly earnings">
        <p className="mt-6 text-center text-sm text-stone">
          No booked deals in the last 12 months yet — this fills in as deals land.
        </p>
      </Card>
    );
  }

  const W = 720;
  const H = 240;
  const padB = 26;
  const padT = 10;
  const plotH = H - padB - padT;
  const max = niceMax(Math.max(...data.map((m) => m.booked)));
  const step = W / data.length;
  const bw = Math.min(38, step * 0.56);
  const active = hover ?? data.length - 1;
  const cur = data[active];

  return (
    <Card eyebrow="Earnings" title="Monthly earnings">
      <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-0.5 text-sm">
        <span className="font-display text-lg">{cur.label}</span>
        <span className="text-[#5B8C5A]">Paid {usd(cur.paid)}</span>
        <span className="text-tulip-dark">On the way {usd(cur.owed)}</span>
        <span className="text-stone">Booked {usd(cur.booked)}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label="Monthly earnings">
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={padT + plotH * t}
            y2={padT + plotH * t}
            stroke={C.grid}
            strokeWidth={1}
          />
        ))}
        {data.map((m, i) => {
          const cx = i * step + step / 2;
          const paidH = (m.paid / max) * plotH;
          const owedH = (m.owed / max) * plotH;
          const baseY = padT + plotH;
          const isActive = i === active;
          return (
            <g
              key={m.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(i)}
              className="cursor-pointer"
            >
              {/* hit target */}
              <rect x={cx - step / 2} y={0} width={step} height={H} fill="transparent" />
              {/* paid (bottom) */}
              {m.paid > 0 && (
                <rect
                  x={cx - bw / 2}
                  y={baseY - paidH}
                  width={bw}
                  height={paidH}
                  rx={4}
                  fill={C.paid}
                  opacity={isActive ? 1 : 0.85}
                />
              )}
              {/* owed (stacked on top, 2px surface gap) */}
              {m.owed > 0 && (
                <rect
                  x={cx - bw / 2}
                  y={baseY - paidH - owedH - (m.paid > 0 ? 2 : 0)}
                  width={bw}
                  height={owedH}
                  rx={4}
                  fill={C.owed}
                  opacity={isActive ? 1 : 0.85}
                />
              )}
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={C.stone}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>

      <Legend
        items={[
          { color: C.paid, label: `Paid · ${usd(paidTotal)} total` },
          { color: C.owed, label: `On the way · ${usd(owedTotal)} total` },
        ]}
      />
    </Card>
  );
}

// ---- Follower growth (line + area) ------------------------------------------
function FollowerChart({ data }: { data: DayFollowers[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <Card eyebrow="Audience" title="Follower growth">
        <p className="mt-6 text-center text-sm text-stone">
          We started recording your follower counts nightly — your growth curve appears here after a
          couple of days of data.
        </p>
      </Card>
    );
  }

  const W = 720;
  const H = 220;
  const padX = 6;
  const padT = 12;
  const padB = 22;
  const plotH = H - padT - padB;
  const plotW = W - padX * 2;
  const vals = data.map((d) => d.total);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => padX + (plotW * i) / (data.length - 1);
  const y = (v: number) => padT + plotH * (1 - (v - min) / span);

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.total)}`).join(' ');
  const areaPath = `${linePath} L ${x(data.length - 1)} ${padT + plotH} L ${x(0)} ${padT + plotH} Z`;
  const active = hover ?? data.length - 1;
  const cur = data[active];
  const first = data[0].total;
  const delta = cur.total - first;

  return (
    <Card eyebrow="Audience" title="Follower growth">
      <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-4 text-sm">
        <span className="font-display text-lg">{fmtCount(cur.total)}</span>
        <span className={delta >= 0 ? 'text-[#5B8C5A]' : 'text-tulip-dark'}>
          {delta >= 0 ? '▲' : '▼'} {fmtCount(Math.abs(delta))} over {data.length} days
        </span>
        <span className="text-stone">
          {new Date(cur.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full"
        role="img"
        aria-label="Follower growth over time"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="followFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.line} stopOpacity={0.18} />
            <stop offset="100%" stopColor={C.line} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#followFill)" />
        <path d={linePath} fill="none" stroke={C.line} strokeWidth={2} strokeLinejoin="round" />
        {/* crosshair + active marker */}
        <line x1={x(active)} x2={x(active)} y1={padT} y2={padT + plotH} stroke={C.grid} strokeWidth={1} />
        <circle cx={x(active)} cy={y(cur.total)} r={4} fill={C.line} stroke="#fff" strokeWidth={2} />
        {/* invisible hover columns */}
        {data.map((d, i) => (
          <rect
            key={d.date}
            x={x(i) - plotW / (data.length - 1) / 2}
            y={0}
            width={plotW / (data.length - 1)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
    </Card>
  );
}

// ---- Content cadence (grouped bars: published vs planned) -------------------
function CadenceChart({ data }: { data: MonthCadence[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totalPosts = data.reduce((s, m) => s + m.planned + m.published, 0);

  if (totalPosts <= 0) {
    return (
      <Card eyebrow="Content" title="Posting cadence">
        <p className="mt-6 text-center text-sm text-stone">
          No posts scheduled or published yet — plan a few in the Content Studio and they’ll show up
          here.
        </p>
      </Card>
    );
  }

  const W = 720;
  const H = 220;
  const padB = 26;
  const padT = 10;
  const plotH = H - padB - padT;
  const max = Math.max(1, ...data.map((m) => Math.max(m.planned, m.published)));
  const step = W / data.length;
  const bw = Math.min(12, step * 0.22);
  const active = hover ?? data.length - 1;
  const cur = data[active];

  return (
    <Card eyebrow="Content" title="Posting cadence">
      <div className="mt-1 flex flex-wrap items-baseline justify-center gap-x-4 text-sm">
        <span className="font-display text-lg">{cur.label}</span>
        <span className="text-ink">{cur.published} published</span>
        <span className="text-tulip-dark">{cur.planned} planned</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label="Posting cadence">
        <line x1={0} x2={W} y1={padT + plotH} y2={padT + plotH} stroke={C.grid} strokeWidth={1} />
        {data.map((m, i) => {
          const cx = i * step + step / 2;
          const baseY = padT + plotH;
          const pubH = (m.published / max) * plotH;
          const planH = (m.planned / max) * plotH;
          const isActive = i === active;
          return (
            <g
              key={m.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(i)}
              className="cursor-pointer"
            >
              <rect x={cx - step / 2} y={0} width={step} height={H} fill="transparent" />
              {/* published (left) + planned (right), 2px gap between */}
              <rect
                x={cx - bw - 1}
                y={baseY - pubH}
                width={bw}
                height={pubH}
                rx={3}
                fill={C.published}
                opacity={isActive ? 1 : 0.85}
              />
              <rect
                x={cx + 1}
                y={baseY - planH}
                width={bw}
                height={planH}
                rx={3}
                fill={C.planned}
                opacity={isActive ? 1 : 0.85}
              />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill={C.stone}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>

      <Legend
        items={[
          { color: C.published, label: 'Published' },
          { color: C.planned, label: 'Planned' },
        ]}
      />
    </Card>
  );
}

export function AnalyticsCharts({
  earnings,
  cadence,
  followers,
  showMoney = true,
}: {
  earnings: MonthEarning[];
  cadence: MonthCadence[];
  followers: DayFollowers[];
  showMoney?: boolean;
}) {
  return (
    <div className="space-y-5">
      {showMoney && <MoneyChart data={earnings} />}
      <FollowerChart data={followers} />
      <CadenceChart data={cadence} />
    </div>
  );
}
