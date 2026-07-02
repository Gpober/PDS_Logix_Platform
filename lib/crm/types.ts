export type Role = 'owner' | 'admin' | 'member';

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
}

export interface ClientOverview {
  id: string;
  name: string;
  category: string | null;
  website: string | null;
  billing_email: string | null;
  phone: string | null;
  date_last_serviced: string | null;
  open_job_count: number;
  job_count: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  client_id: string;
}

export interface Staff {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface Asset {
  id: string;
  client_id: string | null;
  asset_type: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  mileage: number | null;
  license_plate: string | null;
  notes: string | null;
}

export interface JobWithPricing {
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
  price: number | null;
  cost: number | null;
}

export interface Finding {
  area: string;
  severity: string; // minor | moderate | severe
  description: string;
  cost_estimate: number | null;
}

export interface Photo {
  url: string;
  label: string;
}

export const SEVERITIES = ['minor', 'moderate', 'severe'] as const;
export const GRADES = ['excellent', 'good', 'fair', 'poor'] as const;

export interface ConditionReport {
  id: string;
  job_id: string;
  asset_id: string | null;
  overall_grade: string | null;
  mileage: number | null;
  exterior_notes: string | null;
  interior_notes: string | null;
  mechanical_notes: string | null;
  findings: Finding[];
  photos: Photo[];
  inspected_by: string | null;
  inspected_at: string | null;
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
