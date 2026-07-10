-- =============================================================================
-- Tulips Talent — seed_public.sql  (PHASE 2)
-- Opts the phase-1 sample data into the public website and fills in the
-- public-facing fields (bio, headshot, slug, stats, logos). Run AFTER seed.sql
-- and 0004_public.sql. Idempotent (keyed by name).
--
-- Headshots use Unsplash placeholders; brand logos use Clearbit's logo API.
-- Swap these for real assets when you have them.
-- =============================================================================

-- ---- Talent: make public, add profile fields ----
update public.talent set
  is_public      = true,
  is_featured    = true,
  slug           = 'ava-reyes',
  bio            = 'Lifestyle creator blending travel, wellness and everyday luxury for a highly engaged global audience.',
  headshot_url   = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80',
  location       = 'Los Angeles, CA',
  audience_stats = '{"instagram": 482000, "tiktok": 310000, "youtube": 95000}'::jsonb
where name = 'Ava Reyes';

update public.talent set
  is_public      = true,
  is_featured    = true,
  slug           = 'liam-chen',
  bio            = 'Fitness coach and performance creator helping a dedicated community train smarter and live stronger.',
  headshot_url   = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80',
  location       = 'Austin, TX',
  audience_stats = '{"instagram": 268000, "tiktok": 540000}'::jsonb
where name = 'Liam Chen';

update public.talent set
  is_public      = true,
  is_featured    = false,
  slug           = 'noah-patel',
  bio            = 'Beauty and grooming creator known for honest reviews and editorial-grade content.',
  headshot_url   = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
  location       = 'New York, NY',
  audience_stats = '{"instagram": 154000, "youtube": 220000}'::jsonb
where name = 'Noah Patel';

-- ---- Companies (brands): make public + add logos ----
update public.companies set is_public = true, logo_url = 'https://logo.clearbit.com/111skin.com'    where name = '111Skin';
update public.companies set is_public = true, logo_url = 'https://logo.clearbit.com/abercrombie.com' where name = 'Abercrombie & Fitch';
update public.companies set is_public = true, logo_url = 'https://logo.clearbit.com/glossier.com'    where name = 'Glossier';

-- ---- Deals: mark the LIVE ones shareable so their links appear on profiles ----
update public.deals set is_shareable = true
where status = 'live';
