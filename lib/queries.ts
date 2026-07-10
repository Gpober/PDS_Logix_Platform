import { createPublicClient } from './supabase';
import type { PublicTalent, PublicBrand, PublicPartnership } from './types';

// All reads go through the anon client against the public_* views. Every helper
// fails soft (returns empty) so the site renders even if Supabase is unset/down.

export async function getRoster(category?: string): Promise<PublicTalent[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  let query = supabase.from('public_talent').select('*').order('name');
  if (category && category !== 'All') query = query.eq('category', category);
  const { data, error } = await query;
  if (error) {
    console.error('getRoster', error.message);
    return [];
  }
  return (data as PublicTalent[]) ?? [];
}

export async function getFeaturedTalent(limit = 3): Promise<PublicTalent[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('public_talent')
    .select('*')
    .eq('is_featured', true)
    .order('name')
    .limit(limit);
  if (error) {
    console.error('getFeaturedTalent', error.message);
    return [];
  }
  return (data as PublicTalent[]) ?? [];
}

export async function getTalentBySlug(slug: string): Promise<PublicTalent | null> {
  const supabase = createPublicClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('public_talent')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    console.error('getTalentBySlug', error.message);
    return null;
  }
  return (data as PublicTalent) ?? null;
}

export async function getCategories(): Promise<string[]> {
  const roster = await getRoster();
  const set = new Set<string>();
  roster.forEach((t) => t.category && set.add(t.category));
  return Array.from(set).sort();
}

// A named site image (hero, mission, …) uploaded from CRM → Site settings.
// Stored in the `talent-photos` bucket under `site/` as `<key>-<uuid>.<ext>`.
// Returns null if none set yet, so the section falls back to its placeholder.
export async function getSiteImageUrl(key: string): Promise<string | null> {
  const supabase = createPublicClient();
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from('talent-photos')
    .list('site', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error || !data) return null;
  const file = data.find((f) => f.name.startsWith(`${key}-`));
  if (!file) return null;
  const { data: pub } = supabase.storage.from('talent-photos').getPublicUrl(`site/${file.name}`);
  return pub.publicUrl;
}

export function getHeroImageUrl(): Promise<string | null> {
  return getSiteImageUrl('hero');
}

export interface PublicAccount {
  id: string;
  platform: string;
  handle: string | null;
  url: string | null;
  followers: number | null;
}

// A published creator's social accounts, for their public media kit. RLS
// (talent_accounts_public_read) only exposes rows for is_public creators.
export async function getPublicTalentAccounts(talentId: string): Promise<PublicAccount[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('talent_accounts')
    .select('id, platform, handle, url, followers')
    .eq('talent_id', talentId)
    .order('sort', { ascending: true });
  if (error) return [];
  return (data as PublicAccount[]) ?? [];
}

export async function getPublicBrands(): Promise<PublicBrand[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('public_brands').select('*').order('name');
  if (error) {
    console.error('getPublicBrands', error.message);
    return [];
  }
  return (data as PublicBrand[]) ?? [];
}

export async function getPartnerships(talentId: string): Promise<PublicPartnership[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('public_talent_partnerships')
    .select('*')
    .eq('talent_id', talentId)
    .order('booking_date', { ascending: false });
  if (error) {
    console.error('getPartnerships', error.message);
    return [];
  }
  return (data as PublicPartnership[]) ?? [];
}
