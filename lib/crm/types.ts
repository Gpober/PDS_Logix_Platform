export type DealStatus = 'pitched' | 'confirmed' | 'live' | 'completed';
export type Role = 'owner' | 'admin' | 'member' | 'talent';

export const DEAL_STATUSES: DealStatus[] = ['pitched', 'confirmed', 'live', 'completed'];

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
}

export type CompanyType = 'brand' | 'agency' | 'other';
export type CompanyStatus = 'active' | 'prospect' | 'inactive';

export const COMPANY_TYPES: CompanyType[] = ['brand', 'agency', 'other'];
export const COMPANY_STATUSES: CompanyStatus[] = ['active', 'prospect', 'inactive'];

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  category: string | null;
  employee_count: number | null;
  website: string | null;
  notes: string | null;
  status: CompanyStatus;
  logo_url: string | null;
  is_public: boolean;
}

// Row from the company_overview view: a company plus its live-computed booking
// fields and a contact tally.
export interface CompanyOverview {
  id: string;
  name: string;
  type: CompanyType;
  category: string | null;
  employee_count: number | null;
  website: string | null;
  status: CompanyStatus;
  logo_url: string | null;
  is_public: boolean;
  date_last_booked: string | null;
  latest_live_url: string | null;
  deal_count: number;
  contact_count: number;
}

// A person who works at a company (lives inside the company detail page).
export interface Contact {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
}

export interface Talent {
  id: string;
  name: string;
  handle: string | null;
  category: string | null;
  notes: string | null;
  headshot_url: string | null;
  asana_project_gid: string | null;
  user_id: string | null;
  // Public-site publishing controls
  slug: string | null;
  bio: string | null;
  is_public: boolean;
  is_featured: boolean;
  audience_stats: { instagram?: number; tiktok?: number; youtube?: number } | null;
  // Talent's payout cut as a percentage (e.g. 80 = 80%). Used when billing a
  // deal to compute the talent's QBO bill; blank falls back to I AM CFO's default.
  payout_pct: number | null;
}

// Distinct talent a company has worked with (from the company_talent view).
export interface CompanyTalent {
  company_id: string;
  talent_id: string;
  talent_name: string;
  talent_handle: string | null;
  talent_category: string | null;
}

export type DealChannel = 'inbound' | 'outbound';
export const DEAL_CHANNELS: DealChannel[] = ['inbound', 'outbound'];

export interface DealWithBudget {
  id: string;
  company_id: string;
  talent_id: string;
  booking_date: string | null;
  status: DealStatus;
  live_url: string | null;
  notes: string | null;
  budget: number | null;
  invoice_number: string | null;
  channel: DealChannel | null;
  source: string | null;
}

export interface AgencySettings {
  monthly_target: number | null;
  annual_goal: number | null;
  default_agency_pct: number;
}

export type MemoryCategory = 'business' | 'talent' | 'brand' | 'preference' | 'general';
export const MEMORY_CATEGORIES: MemoryCategory[] = ['business', 'talent', 'brand', 'preference', 'general'];

// A durable fact Zordon carries across sessions — loaded into her prompt.
export interface AssistantMemory {
  id: string;
  created_by: string | null;
  content: string;
  category: MemoryCategory;
  subject: string | null;
  talent_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export type DraftKind = 'pitch' | 'follow_up' | 'reply' | 'other';
export const DRAFT_KINDS: DraftKind[] = ['pitch', 'follow_up', 'reply', 'other'];

// An outreach email Zordon composed. Draft only — nothing is sent from here; a
// human reviews it and sends from their own mail. `status` reserves room for a
// future gated "sent" transition.
export interface AssistantDraft {
  id: string;
  created_by: string | null;
  kind: DraftKind;
  to_name: string | null;
  to_email: string | null;
  subject: string;
  body: string;
  lead_id: string | null;
  talent_id: string | null;
  company_id: string | null;
  status: 'draft' | 'sent' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string | null;
  talent_of_interest: string | null;
  source: string;
  created_at: string;
  owner: string | null;
  last_pitch_on: string | null;
  last_pitch_text: string | null;
  next_eligible_on: string | null;
  next_eligible_text: string | null;
  history: string | null;
  fit: string | null;
}
