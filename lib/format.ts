import type { ServiceType, JobStatus } from './crm/types';

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

export function serviceLabel(s: ServiceType): string {
  return {
    condition_report: 'Condition Report',
    detailing: 'Detailing',
    biohazard: 'Biohazard',
  }[s];
}

export function statusLabel(s: JobStatus): string {
  return {
    requested: 'Requested',
    scheduled: 'Scheduled',
    in_progress: 'In progress',
    completed: 'Completed',
    invoiced: 'Invoiced',
  }[s];
}

// Tailwind classes for a status pill.
export function statusClasses(s: JobStatus): string {
  return {
    requested: 'bg-stone/15 text-stone',
    scheduled: 'bg-steel/15 text-steel',
    in_progress: 'bg-pds/20 text-pds-dark',
    completed: 'bg-emerald-100 text-emerald-700',
    invoiced: 'bg-ink/10 text-ink',
  }[s];
}

export function vehicleLabel(a: {
  year: number | null;
  make: string | null;
  model: string | null;
} | null | undefined): string {
  if (!a) return '—';
  const parts = [a.year, a.make, a.model].filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}
