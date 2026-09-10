// Equivalence check: the TypeScript renderer must produce byte-identical HTML to
// docs/daily-production-email/render_preview.py for the same figures.
//
// The Python script is the reference the approved design was signed off against,
// so this is how we know the port did not quietly change a rounding rule, a sort
// order, or a tint.
//
//   npx tsx scripts/verify-daily-report.ts
//
// Pure rendering only — no database, no Connecteam.

import fs from 'node:fs';
import { renderReport, type ReportData, type WorkerRow } from '../lib/production/dailyReport';

// The SAMPLE block from render_preview.py, verbatim.
const SAMPLE: WorkerRow[] = [
  { name: 'Chadwick Williams', location: 'Manheim Dallas', day: 39, week: 81, month: 292 },
  { name: 'David Munoz', location: 'Manheim Dallas', day: 27, week: 118, month: 403 },
  { name: 'Kevin J. Arevalo', location: 'Manheim Dallas', day: 0, week: 67, month: 354 },
  { name: 'Maximus Matthews', location: 'Manheim Dallas', day: 0, week: 115, month: 330 },
  { name: 'Daniel Restrepo', location: 'Manheim Atlanta', day: 0, week: 55, month: 55 },
  { name: 'Esthefany Delgado', location: 'Manheim DFW', day: 56, week: 319, month: 960 },
  { name: 'Blanca Tinoco', location: 'Manheim Dallas', day: 0, week: 210, month: 1034 },
  { name: 'Andriu Gonzalez', location: 'Manheim DFW', day: 69, week: 267, month: 866 },
  { name: 'Dariany Tua', location: 'Manheim DFW', day: 0, week: 111, month: 410 },
  { name: 'Jean Clauda Richard', location: 'Manheim', day: 0, week: 0, month: 0 },
  { name: 'Jean Ernst Petit', location: 'Manheim', day: 0, week: 0, month: 0 },
];

const data: ReportData = {
  // 2026-08-21 renders as "Aug 21, 2026", the SAMPLE_AS_OF the Python uses.
  asOf: '2026-08-21',
  workers: SAMPLE,
  reads: {} as ReportData['reads'],
  warnings: [],
};

const out = renderReport(data);
fs.writeFileSync('/tmp/ts-report.html', out.html);

const py = fs.readFileSync('docs/daily-production-email/preview.html', 'utf8')
  // render_preview.py wraps its output in a bare document shell.
  .replace('<!doctype html><meta charset="utf8"><body style="margin:0">', '')
  .replace(/<\/body>$/, '');

const same = py === out.html;
console.log('subject :', out.subject);
console.log('piecework totals [dPc,dRev,wPc,wRev,mPc,mRev] :', out.totals.piecework.join(', '));
console.log('photo     totals [dPc,dRev,wPc,wRev,mPc,mRev] :', out.totals.photo.join(', '));
console.log('unpriced :', out.unpriced.length ? out.unpriced.join(', ') : '(none)');
console.log(same ? '\nMATCH: identical to render_preview.py' : '\nDIFFER from render_preview.py');

if (!same) {
  const a = py.split('\n');
  const b = out.html.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`\nfirst difference at line ${i + 1}`);
      console.log('  python:', JSON.stringify(a[i]?.slice(0, 200)));
      console.log('  ts    :', JSON.stringify(b[i]?.slice(0, 200)));
      break;
    }
  }
  process.exit(1);
}
