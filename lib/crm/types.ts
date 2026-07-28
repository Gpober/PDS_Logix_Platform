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

// ---- Assistant: drafts, memory, reports, team runs -------------------------
// These back Zordon's write-side capabilities. Every row is owner/admin-gated
// via RLS (see supabase/migrations/0005_assistant.sql + 0006_assistant_team.sql).

export type DraftKind = 'follow_up' | 'quote' | 'reply' | 'other';

// An outreach email Zordon composed. Saved, never sent — the team reads it on
// the Drafts page and sends from their own mail.
export interface AssistantDraft {
  id: string;
  kind: DraftKind;
  subject: string;
  body: string;
  to_name: string | null;
  to_email: string | null;
  lead_id: string | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
}

export type MemoryCategory = 'business' | 'client' | 'operations' | 'preference' | 'general';

// A durable fact Zordon carries across every conversation.
export interface AssistantMemory {
  id: string;
  content: string;
  category: MemoryCategory;
  subject: string | null;
  client_id: string | null;
  created_by: string | null;
  created_at: string;
}

// ---- Visual reports --------------------------------------------------------
// The block vocabulary Zordon composes a report from. Rendered by
// components/crm/ReportBlocks.tsx.

export type ReportTone = 'ink' | 'positive' | 'negative' | 'warning' | 'info';

export interface KpiItem {
  label: string;
  value: string;
  tone?: ReportTone;
}

export type ReportBlock =
  | { type: 'text'; heading?: string; body: string }
  | { type: 'callout'; tone?: ReportTone; text: string }
  | { type: 'kpis'; items: KpiItem[] }
  | { type: 'bar'; title?: string; unit?: string; series: { label: string; value: number }[] }
  | { type: 'line'; title?: string; unit?: string; points: { label: string; value: number }[] }
  | { type: 'table'; title?: string; columns: string[]; rows: string[][] };

export interface AssistantReport {
  id: string;
  title: string;
  summary: string | null;
  blocks: ReportBlock[];
  created_by: string | null;
  created_at: string;
}

// ---- Team runs (the Railway worker's job queue) ----------------------------

export type TeamRunStatus = 'queued' | 'running' | 'done' | 'error';

export interface TeamRunResultItem {
  target: string; // e.g. a client name or "operations"
  specialist: string;
  label: string;
  report: string;
}

export interface TeamRun {
  id: string;
  scope: string; // free-text brief describing what the crew was asked to do
  status: TeamRunStatus;
  results: TeamRunResultItem[];
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
