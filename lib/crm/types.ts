// Domain types for the PDS Logix CRM — a vehicle field-service business
// (condition-report inspections, detailing, biohazard remediation). These mirror
// the Supabase schema exactly; every read/write runs under the caller's RLS.

export type Role = 'owner' | 'admin' | 'member';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
}

export interface Client {
  id: string;
  name: string;
  category: string | null;
  website: string | null;
  billing_email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  logo_url: string | null;
  is_public: boolean;
  qbo_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  client_id: string;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type AssetType = 'vehicle' | string;

export interface Asset {
  id: string;
  client_id: string | null;
  asset_type: AssetType;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  mileage: number | null;
  license_plate: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ServiceType = 'condition_report' | 'detailing' | 'biohazard';
export type JobStatus = 'requested' | 'scheduled' | 'in_progress' | 'completed' | 'invoiced';

export const SERVICE_TYPES: ServiceType[] = ['condition_report', 'detailing', 'biohazard'];
export const JOB_STATUSES: JobStatus[] = [
  'requested',
  'scheduled',
  'in_progress',
  'completed',
  'invoiced',
];

export const SERVICE_LABELS: Record<ServiceType, string> = {
  condition_report: 'Condition Report',
  detailing: 'Detailing',
  biohazard: 'Biohazard',
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  invoiced: 'Invoiced',
};

export interface Job {
  id: string;
  client_id: string;
  asset_id: string | null;
  assigned_staff_id: string | null;
  service_type: ServiceType;
  status: JobStatus;
  scheduled_date: string | null;
  completed_date: string | null;
  location: string | null;
  notes: string | null;
  summary: string | null;
  cover_photo_url: string | null;
  is_shareable: boolean;
  qbo_invoice_id: string | null;
  qbo_invoice_status: string | null;
  qbo_balance: number | null;
  qbo_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobPricing {
  job_id: string;
  price: number | null;
  cost: number | null;
  created_at: string;
  updated_at: string;
}

// A job joined to the names/labels a list view needs.
export interface JobWithRelations extends Job {
  client_name: string | null;
  staff_name: string | null;
  asset_label: string | null;
  price: number | null;
  cost: number | null;
}

export interface ConditionFinding {
  area?: string;
  severity?: string;
  note?: string;
}

export interface ConditionReport {
  id: string;
  job_id: string;
  asset_id: string | null;
  overall_grade: string | null;
  mileage: number | null;
  exterior_notes: string | null;
  interior_notes: string | null;
  mechanical_notes: string | null;
  findings: ConditionFinding[];
  photos: string[];
  inspected_by: string | null;
  inspected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  service_type: string | null;
  message: string | null;
  source: string;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  staff_id: string;
  job_id: string | null;
  clock_in: string;
  clock_out: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryWithRelations extends TimeEntry {
  staff_name: string | null;
  job_label: string | null;
  duration_ms: number | null; // null while still clocked in
}

// Helper: a human label for an asset (e.g. "2021 Toyota Camry").
export function assetLabel(a: Pick<Asset, 'year' | 'make' | 'model' | 'vin'>): string {
  const parts = [a.year, a.make, a.model].filter(Boolean).join(' ').trim();
  return parts || a.vin || 'Asset';
}
