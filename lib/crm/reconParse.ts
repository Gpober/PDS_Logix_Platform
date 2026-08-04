import * as XLSX from 'xlsx';

// Parsing for a car-count file (csv / xlsx / xls / tsv) — either the auction's
// unit list or our own count. Column names vary by auction, statement, and
// report template, so the matchers are generous and the header row itself is
// sniffed: these exports routinely carry a title / filter block above it.

export interface ParsedUnit {
  external_ref: string | null;
  vin: string | null;
  vin6: string | null;          // last 6 alphanumerics, uppercased — the match key
  serviced_on: string | null;   // YYYY-MM-DD
  location: string | null;
  service_type: string | null;
  vehicle_desc: string | null;
  amount: number | null;
}

export interface ParsedSheet {
  units: ParsedUnit[];
  noVin: number;                // rows we kept but can never match (no VIN)
  headerRow: number;            // 0-based, for troubleshooting a odd export
  columns: string[];            // which fields we found, for the same reason
}

const norm = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

const HEADERS = {
  vin: [/^vin$/i, /vin\s*#?$/i, /vehicle\s*id/i, /serial/i],
  ref: [/work\s*order/i, /^wo\s*#?$/i, /invoice\s*#?/i, /^ref/i, /stock\s*#?/i, /line\s*(id|#)/i, /^#$/, /^id$/i],
  date: [/service\s*date/i, /completed/i, /scan\s*date/i, /sale\s*date/i, /^date$/i, /submission\s*date/i, /date\s*(performed|worked|in)/i, /timestamp/i],
  location: [/^location$/i, /auction/i, /^site$/i, /branch/i, /facility/i, /^lot$/i],
  service: [/service\s*type/i, /^service$/i, /description/i, /^item$/i, /work\s*type/i, /^type$/i, /product/i],
  amount: [/^amount$/i, /^charge/i, /^price$/i, /^total$/i, /^fee$/i, /net\s*amount/i, /extended/i],
  year: [/^year$/i, /model\s*year/i],
  make: [/^make$/i],
  model: [/^model$/i, /model\s*type/i, /vehicle/i],
} as const;

type Key = keyof typeof HEADERS;

// Map a candidate header row to column indexes. Each column is claimed once, in
// key order, so a "Vehicle ID" goes to vin rather than to model.
function mapRow(cells: unknown[]): Partial<Record<Key, number>> {
  const headers = cells.map((h) => norm(h));
  const found: Partial<Record<Key, number>> = {};
  const taken = new Set<number>();
  for (const key of Object.keys(HEADERS) as Key[]) {
    for (const re of HEADERS[key]) {
      const i = headers.findIndex((h, idx) => h !== '' && !taken.has(idx) && re.test(h));
      if (i >= 0) { found[key] = i; taken.add(i); break; }
    }
  }
  return found;
}

function findHeaderRow(grid: unknown[][]): { index: number; cols: Partial<Record<Key, number>> } | null {
  let best: { index: number; cols: Partial<Record<Key, number>>; score: number } | null = null;
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const cols = mapRow(grid[r] ?? []);
    const score = Object.keys(cols).length + (cols.vin != null ? 2 : 0);
    if (score >= 2 && (!best || score > best.score)) best = { index: r, cols, score };
  }
  return best ? { index: best.index, cols: best.cols } : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toDay(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// "$1,234.50" → 1234.5, "(45.00)" → −45 (accounting negatives).
export function toAmount(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[()$,\s]/g, '').replace(/^-/, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export const vinKey = (vin: string): string | null =>
  vin.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-6) || null;

// Parse a whole workbook/csv buffer into units. `fallbackLocation` fills in when
// the sheet has no location column (a per-location export usually doesn't).
export function parseReconSheet(buf: Buffer, fallbackLocation?: string): ParsedSheet | { error: string } {
  let grid: unknown[][];
  try {
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' });
  } catch {
    return { error: 'Could not read that file — expected a .csv, .xlsx, or .xls.' };
  }
  if (!grid.length) return { error: 'The sheet is empty.' };

  const header = findHeaderRow(grid);
  if (!header) {
    return { error: 'Couldn’t find the columns — the sheet needs a header row with at least a VIN (plus ideally a date, work order, and amount).' };
  }
  const { index: headerIdx, cols } = header;
  const cell = (row: unknown[], i: number | undefined) => (i == null ? undefined : row[i]);

  const units: ParsedUnit[] = [];
  let noVin = 0;
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    if (!row || row.every((c) => c == null || c === '')) continue;
    const vin = norm(cell(row, cols.vin));
    const ref = norm(cell(row, cols.ref));
    const day = toDay(cell(row, cols.date));
    // Nothing identifying at all — a totals/footer line, not a unit.
    if (!vin && !ref && !day) continue;
    const key = vin ? vinKey(vin) : null;
    if (!key) noVin++;
    const yearRaw = Number(cell(row, cols.year));
    const desc = [
      Number.isFinite(yearRaw) && yearRaw > 1900 ? String(Math.trunc(yearRaw)) : '',
      norm(cell(row, cols.make)),
      norm(cell(row, cols.model)),
    ].filter(Boolean).join(' ');
    units.push({
      external_ref: ref || null,
      vin: vin || null,
      vin6: key,
      serviced_on: day,
      location: norm(cell(row, cols.location)) || fallbackLocation || null,
      service_type: norm(cell(row, cols.service)) || null,
      vehicle_desc: desc || null,
      amount: toAmount(cell(row, cols.amount)),
    });
  }
  if (!units.length) return { error: 'No unit rows found under the header.' };

  return { units, noVin, headerRow: headerIdx, columns: Object.keys(cols) };
}
