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
  late: null,
};

const out = renderReport(data);
fs.writeFileSync('/tmp/ts-report.html', out.html);

const py = fs.readFileSync('docs/daily-production-email/preview.html', 'utf8')
  // render_preview.py wraps its output in a bare document shell.
  .replace('<!doctype html><meta charset="utf8"><body style="margin:0">', '')
  .replace(/<\/body>$/, '');

// The TS renderer replaces the footer's static "synced nightly" with live
// provenance (which source served the run, and what reading live caught that
// the copy had not). That line is DELIBERATELY different from the Python
// reference; everything else — every number, tint, row and total — must still
// match byte for byte, which is what this test is actually protecting.
const FOOTER_PY = '&middot; synced nightly';
const FOOTER_TS = '&middot; from the nightly synced copy';
if (!out.html.includes(FOOTER_TS)) {
  console.log(`FAIL: expected footer provenance ${JSON.stringify(FOOTER_TS)} not found`);
  process.exit(1);
}
const normalised = out.html.split(FOOTER_TS).join(FOOTER_PY);
const same = py === normalised;
console.log('subject :', out.subject);
console.log('piecework totals [dPc,dRev,wPc,wRev,mPc,mRev] :', out.totals.piecework.join(', '));
console.log('photo     totals [dPc,dRev,wPc,wRev,mPc,mRev] :', out.totals.photo.join(', '));
console.log('unpriced :', out.unpriced.length ? out.unpriced.join(', ') : '(none)');
console.log(
  same
    ? '\nMATCH: identical to render_preview.py (footer provenance aside, asserted separately)'
    : '\nDIFFER from render_preview.py',
);

if (!same) {
  const a = py.split('\n');
  const b = normalised.split('\n');
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
