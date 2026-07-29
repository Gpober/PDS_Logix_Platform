'use client';

// Download the pay roster as a CSV the owner can hand to Gusto. One row per
// worker with hours, units, rates, and gross pay for the period. Pure client —
// the server already computed the numbers.
export interface PayExportRow {
  name: string;
  email: string | null;
  payroll_group: string;
  hours: number;
  units: number;
  hourly_rate: number | null;
  unit_rate: number | null;
  hourlyPay: number;
  unitPay: number;
  total: number;
}

function csvCell(v: string | number | null): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function PayExportButton({ rows, periodStart, periodEnd, payDate, group }: {
  rows: PayExportRow[];
  periodStart: string;
  periodEnd: string;
  payDate: string;
  group: string;
}) {
  function download() {
    const headers = [
      'First Name', 'Last Name', 'Email', 'Pay Group',
      'Regular Hours', 'Units', 'Hourly Rate', 'Unit Rate',
      'Hourly Pay', 'Unit Pay', 'Gross Pay',
      'Period Start', 'Period End', 'Pay Date',
    ];
    const body = rows.map((r) => {
      const [first, ...rest] = r.name.split(' ');
      const last = rest.join(' ');
      return [
        first, last, r.email ?? '', r.payroll_group,
        r.hours, r.units, r.hourly_rate ?? '', r.unit_rate ?? '',
        r.hourlyPay.toFixed(2), r.unitPay.toFixed(2), r.total.toFixed(2),
        periodStart, periodEnd, payDate,
      ].map(csvCell).join(',');
    });
    const csv = [headers.join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll_group-${group}_${periodStart}_to_${periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={download}
      disabled={rows.length === 0}
      className="flex items-center gap-2 rounded-full bg-tulip px-4 py-2 text-sm text-ivory transition-colors hover:bg-tulip-dark disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
      Export for Gusto
    </button>
  );
}
