// Render the daily production email for a given day from figures supplied on
// stdin, without needing database credentials. Used to produce a real send from
// a machine that can reach Postgres but not the app's service role key.
//
//   npx tsx scripts/render-today.ts <asOf> < figures.json > out.html
//
// figures.json: [{ name, location, day, week, month }] — the same shape
// collectReport() builds from the source layer.

import fs from 'node:fs';
import { renderReport, PHOTO_SIX, type ReportData, type WorkerRow } from '../lib/production/dailyReport';

const asOf = process.argv[2];
if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  console.error('usage: render-today.ts YYYY-MM-DD < figures.json');
  process.exit(1);
}

const supplied: WorkerRow[] = JSON.parse(fs.readFileSync(0, 'utf8'));

// The photo six are always listed, even at zero — same rule as collectReport.
const names = new Set(supplied.map((w) => w.name));
const workers: WorkerRow[] = [...supplied];
for (const name of PHOTO_SIX) {
  if (!names.has(name)) workers.push({ name, location: 'Manheim', day: 0, week: 0, month: 0 });
}

const data: ReportData = {
  asOf,
  workers,
  reads: {} as ReportData['reads'],
  warnings: [],
};

const out = renderReport(data);
process.stdout.write(out.html);
console.error('subject   :', out.subject);
console.error('piecework :', out.totals.piecework.join(', '));
console.error('photo     :', out.totals.photo.join(', '));
console.error('unpriced  :', out.unpriced.length ? out.unpriced.join(', ') : '(none)');
