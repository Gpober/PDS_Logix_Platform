// Shared period resolver for the financial report tabs (This month / Last month
// / Year to date). UTC calendar math.
export type FinPeriodKey = 'month' | 'last' | 'ytd';

const pad = (n: number) => String(n).padStart(2, '0');

export function resolveFinPeriod(period?: string): { key: FinPeriodKey; from: string; to: string; label: string } {
  const key: FinPeriodKey = period === 'month' || period === 'last' ? period : 'ytd';
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const today = `${y}-${pad(m)}-${pad(now.getUTCDate())}`;
  if (key === 'month') return { key, from: `${y}-${pad(m)}-01`, to: today, label: 'This month' };
  if (key === 'last') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    return { key, from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}`, label: 'Last month' };
  }
  return { key, from: `${y}-01-01`, to: today, label: 'Year to date' };
}
