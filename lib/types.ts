// Shapes mirror the public_* views in supabase/migrations/0004_public.sql.
// These are the ONLY fields the anon role can read — no budget, notes, or
// internal contact data exists here by construction.

export interface AudienceStats {
  instagram?: number;
  tiktok?: number;
  youtube?: number;
  [platform: string]: number | undefined;
}

export interface PublicTalent {
  id: string;
  slug: string | null;
  name: string;
  handle: string | null;
  category: string | null;
  bio: string | null;
  headshot_url: string | null;
  location: string | null;
  audience_stats: AudienceStats;
  is_featured: boolean;
}

export interface PublicBrand {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  category: string | null;
}

export interface PublicPartnership {
  id: string;
  talent_id: string;
  brand_name: string;
  brand_logo_url: string | null;
  live_url: string;
  booking_date: string | null;
}

export interface LeadInput {
  name: string;
  email: string;
  company?: string;
  message?: string;
  talent_of_interest?: string;
}
