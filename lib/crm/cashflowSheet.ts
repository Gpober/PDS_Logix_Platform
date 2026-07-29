import type { CashForecast, ForecastAdjustment } from './forecast';

// Maps the cash forecast to/from a Google Sheet. The top block is the computed
// forecast (read-only in spirit); the ADJUSTMENTS block at the bottom is the
// editable round-trip — anything typed there comes back as forecast_adjustments.

export const ADJ_MARKER = 'ADJUSTMENTS — edit below · Label | Week (YYYY-MM-DD) | Amount (+ in / − out)';

export function buildSheetValues(f: CashForecast, adjustments: ForecastAdjustment[]): (string | number)[][] {
  const weekCols = f.weeks.map((w) => w.weekEnd);
  const rows: (string | number)[][] = [];
  rows.push(['PDS Logix — Cash Forecast']);
  rows.push([`Starting cash (Fri ${f.anchor.date})`, f.anchor.balance]);
  rows.push([`Source: ${f.anchor.source}`]);
  rows.push([]);
  rows.push(['', ...weekCols]);
  rows.push(['Money in', ...f.weeks.map((w) => w.inflow)]);
  rows.push(['Money out', ...f.weeks.map((w) => w.outflow)]);
  rows.push(['Payroll', ...f.weeks.map((w) => w.payroll)]);
  rows.push(['Net', ...f.weeks.map((w) => w.net)]);
  rows.push(['Ending balance', ...f.weeks.map((w) => w.endingBalance)]);
  rows.push([]);
  rows.push([ADJ_MARKER]);
  rows.push(['Label', 'Week', 'Amount']);
  for (const a of adjustments) rows.push([a.label ?? '', a.week_ending, a.amount]);
  for (let i = 0; i < 10; i++) rows.push(['', '', '']); // blank rows for new entries
  return rows;
}

// Parse the ADJUSTMENTS block back into rows. Only well-formed lines survive
// (a real YYYY-MM-DD week and a non-zero amount).
export function parseAdjustments(values: (string | number)[][]): { label: string | null; week_ending: string; amount: number }[] {
  let start = -1;
  for (let i = 0; i < values.length; i++) {
    if (String(values[i]?.[0] ?? '').startsWith('ADJUSTMENTS')) { start = i + 2; break; } // + marker row + column header
  }
  if (start < 0) return [];
  const out: { label: string | null; week_ending: string; amount: number }[] = [];
  for (let i = start; i < values.length; i++) {
    const row = values[i] ?? [];
    const label = String(row[0] ?? '').trim();
    const week = String(row[1] ?? '').trim();
    const amtRaw = String(row[2] ?? '').trim();
    if (!week && !amtRaw) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) continue;
    const amt = Number(amtRaw.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amt) || amt === 0) continue;
    out.push({ label: label || null, week_ending: week, amount: amt });
  }
  return out;
}
