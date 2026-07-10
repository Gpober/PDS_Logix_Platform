'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { syncDealToCalendar, removeDealFromCalendar } from '@/lib/google/calendar';
import { sendGmail } from '@/lib/google/gmail';
import { fetchYouTube } from '@/lib/integrations/youtube';
import { refreshYouTubeToken, fetchMyYouTubeChannel } from '@/lib/integrations/youtubeOAuth';
import { publishPostById } from '@/lib/crm/publish';
import { draftInstagramCaption } from '@/lib/integrations/anthropic';
import { fetchProfileGraph, fetchInsightsGraph } from '@/lib/integrations/instagramGraph';
import { getInstagramGraphConnection, getInstagramGraphDiscovery } from '@/lib/crm/data';
import { createIamcfoBilling, type BillingRequest } from '@/lib/integrations/iamcfo';
import type { DealStatus } from './types';

function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}

function num(form: FormData, key: string): number | null {
  const s = str(form, key);
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === 'true';
}

// URL-safe slug from a display name: "Jane Doe" -> "jane-doe".
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

async function isOwner(): Promise<boolean> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('is_owner');
  return data === true;
}

// ---- Companies ----------------------------------------------------------
export async function saveCompany(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const type = str(form, 'type') ?? 'brand';
  const status = str(form, 'status') ?? 'active';
  const payload = {
    name: str(form, 'name') ?? '',
    type: ['brand', 'agency', 'other'].includes(type) ? type : 'brand',
    category: str(form, 'category'),
    employee_count: num(form, 'employee_count'),
    website: str(form, 'website'),
    notes: str(form, 'notes'),
    status: ['active', 'prospect', 'inactive'].includes(status) ? status : 'active',
    is_public: bool(form, 'is_public'),
  };
  if (id) await supabase.from('companies').update(payload).eq('id', id);
  else await supabase.from('companies').insert(payload);
  revalidatePath('/crm/companies');
  redirect(id ? `/crm/companies/${id}` : '/crm/companies');
}

export async function deleteCompany(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (!id) redirect('/crm/companies');
  // Contacts cascade with the company; deals cascade too (deals.company_id FK).
  await supabase.from('companies').delete().eq('id', id);
  revalidatePath('/crm/companies');
  redirect('/crm/companies');
}

// ---- Contacts -----------------------------------------------------------
// A contact always belongs to a company; company_id is required. After save we
// return to the company's detail page, where contacts are shown inline.
export async function saveContact(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const companyId = str(form, 'company_id');
  if (!companyId) redirect('/crm/companies');
  const payload = {
    name: str(form, 'name') ?? '',
    email: str(form, 'email'),
    phone: str(form, 'phone'),
    title: str(form, 'title'),
    is_primary: bool(form, 'is_primary'),
    company_id: companyId,
  };
  // Keep a single primary per company.
  if (payload.is_primary) {
    let q = supabase.from('contacts').update({ is_primary: false }).eq('company_id', companyId);
    if (id) q = q.neq('id', id);
    await q;
  }
  if (id) await supabase.from('contacts').update(payload).eq('id', id);
  else await supabase.from('contacts').insert(payload);
  revalidatePath(`/crm/companies/${companyId}`);
  redirect(`/crm/companies/${companyId}`);
}

export async function deleteContact(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const companyId = str(form, 'company_id');
  if (id) await supabase.from('contacts').delete().eq('id', id);
  if (companyId) {
    revalidatePath(`/crm/companies/${companyId}`);
    redirect(`/crm/companies/${companyId}`);
  }
  redirect('/crm/companies');
}

// ---- Agency settings (analytics targets) --------------------------------
// Owner/admin-only; RLS on agency_settings rejects a member's write regardless.
export async function saveAgencySettings(form: FormData) {
  const supabase = await createServerSupabase();
  const payload = {
    monthly_target: num(form, 'monthly_target'),
    annual_goal: num(form, 'annual_goal'),
    default_agency_pct: num(form, 'default_agency_pct') ?? 20,
  };
  await supabase.from('agency_settings').update(payload).eq('id', 1);
  revalidatePath('/crm/settings');
  revalidatePath('/crm/analytics');
  redirect('/crm/settings?saved=1');
}

// ---- Talent -------------------------------------------------------------

export interface UploadResult {
  url?: string;
  error?: string;
}

// Uploads a headshot to the `talent-photos` storage bucket and returns its
// public URL. Called imperatively from the CRM talent form's upload widget.
export async function uploadTalentPhoto(form: FormData): Promise<UploadResult> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'No file selected.' };
  }
  if (!file.type.startsWith('image/')) {
    return { error: 'Please choose an image file.' };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: 'Image is too large (max 8MB).' };
  }

  const supabase = await createServerSupabase();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('talent-photos')
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });

  if (error) {
    console.error('uploadTalentPhoto', error.message);
    return {
      error: error.message.includes('Bucket not found')
        ? 'Photo storage isn’t set up yet — run migration 0018 (or create a public “talent-photos” bucket in Supabase).'
        : 'Upload failed. Please try again.',
    };
  }

  const { data } = supabase.storage.from('talent-photos').getPublicUrl(path);
  return { url: data.publicUrl };
}

// Busts the public-page ISR caches after a client-side image upload so new
// images show immediately.
export async function revalidateHome() {
  revalidatePath('/');
  revalidatePath('/contact');
}

// Uploads the homepage hero image to `talent-photos/site/`. Replaces any
// existing hero (new filename each time busts the CDN cache). Returns its URL.
export async function setHeroImage(form: FormData): Promise<UploadResult> {
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' };
  if (!file.type.startsWith('image/')) return { error: 'Please choose an image file.' };
  if (file.size > 12 * 1024 * 1024) return { error: 'Image is too large (max 12MB).' };

  const supabase = await createServerSupabase();

  // Clear out the previous hero so only one lives under site/.
  const { data: existing } = await supabase.storage.from('talent-photos').list('site');
  if (existing && existing.length > 0) {
    await supabase.storage
      .from('talent-photos')
      .remove(existing.map((f) => `site/${f.name}`));
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `site/hero-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from('talent-photos')
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: true });

  if (error) {
    console.error('setHeroImage', error.message);
    return {
      error: error.message.includes('Bucket not found')
        ? 'Photo storage isn’t set up yet — create a public “talent-photos” bucket in Supabase.'
        : 'Upload failed. Please try again.',
    };
  }

  const { data } = supabase.storage.from('talent-photos').getPublicUrl(path);
  // Refresh the homepage so the new hero shows immediately.
  revalidatePath('/');
  return { url: data.publicUrl };
}

export async function saveTalent(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const name = str(form, 'name') ?? '';

  // Follower counts → audience_stats jsonb (only keep platforms with a value).
  const audience: Record<string, number> = {};
  const ig = num(form, 'instagram');
  const tt = num(form, 'tiktok');
  const yt = num(form, 'youtube');
  if (ig !== null) audience.instagram = ig;
  if (tt !== null) audience.tiktok = tt;
  if (yt !== null) audience.youtube = yt;

  // Slug: use the given one, else derive from the name so profile URLs work.
  const slug = str(form, 'slug') ? slugify(str(form, 'slug')!) : name ? slugify(name) : null;

  const payload = {
    name,
    handle: str(form, 'handle'),
    category: str(form, 'category'),
    notes: str(form, 'notes'),
    headshot_url: str(form, 'headshot_url'),
    slug,
    bio: str(form, 'bio'),
    is_public: bool(form, 'is_public'),
    is_featured: bool(form, 'is_featured'),
    audience_stats: audience,
    payout_pct: num(form, 'payout_pct'),
  };
  if (id) await supabase.from('talent').update(payload).eq('id', id);
  else await supabase.from('talent').insert(payload);
  revalidatePath('/crm/talent');
  // Refresh the public site so published talent appears right away.
  revalidatePath('/');
  revalidatePath('/roster');
  if (slug) revalidatePath(`/talent/${slug}`);
  redirect('/crm/talent');
}

// ---- Talent accounts (creator portal) -----------------------------------
// RLS (talent_accounts_self / _staff) enforces that a creator can only touch
// their own rows, so a spoofed talent_id in the form can't write to someone else.
export async function saveTalentAccount(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const payload = {
    talent_id: str(form, 'talent_id'),
    platform: (str(form, 'platform') ?? 'website').toLowerCase(),
    handle: str(form, 'handle'),
    url: str(form, 'url'),
    followers: num(form, 'followers'),
  };
  if (id) await supabase.from('talent_accounts').update(payload).eq('id', id);
  else await supabase.from('talent_accounts').insert(payload);
  revalidatePath('/portal');
}

export async function deleteTalentAccount(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (id) await supabase.from('talent_accounts').delete().eq('id', id);
  revalidatePath('/portal');
}

// Pull a live follower count from the platform's API and mark the account
// verified. Currently supports YouTube (public API key). Instagram/TikTok land
// here too once their API credentials are configured.
export async function syncTalentAccount(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (!id) redirect('/portal');

  const { data } = await supabase
    .from('talent_accounts')
    .select('platform, handle, url')
    .eq('id', id)
    .maybeSingle();
  const acct = data as { platform: string; handle: string | null; url: string | null } | null;
  if (!acct) redirect('/portal?sync=not_found');

  if (acct.platform !== 'youtube') {
    redirect('/portal?sync=unsupported');
  }

  // Preferred path: an OAuth "Connect YouTube" connection — refresh the token and
  // pull the authorized channel directly (no handle needed, works for hidden
  // counts too).
  const { data: conn } = await supabase
    .from('youtube_connections')
    .select('refresh_token')
    .eq('talent_account_id', id)
    .maybeSingle();
  const refreshToken = (conn as { refresh_token: string | null } | null)?.refresh_token ?? null;

  if (refreshToken) {
    const refreshed = await refreshYouTubeToken(refreshToken);
    if (!refreshed) redirect('/portal?sync=api_error');
    const channel = await fetchMyYouTubeChannel(refreshed.accessToken);
    if (!channel) redirect('/portal?sync=api_error');
    await supabase
      .from('youtube_connections')
      .update({
        access_token: refreshed.accessToken,
        expiry: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('talent_account_id', id);
    await supabase
      .from('talent_accounts')
      .update({
        followers: channel.subscribers,
        verified: true,
        yt_channel_id: channel.channelId,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', id);
    revalidatePath('/portal');
    redirect('/portal?sync=ok');
  }

  // Fallback: public API-key lookup by handle/URL.
  const result = await fetchYouTube(acct.handle, acct.url);
  if (result.ok) {
    await supabase
      .from('talent_accounts')
      .update({
        followers: result.subscribers,
        verified: true,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', id);
    revalidatePath('/portal');
    redirect('/portal?sync=ok');
  }
  redirect(`/portal?sync=${result.reason}`);
}

// ---- Content workspace (creator planner + media) ------------------------
// RLS (content_*_self / _staff) confines a creator to their own rows.
export async function saveContentPost(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  // media_urls: newline-separated, order preserved (carousel = 2–10 items).
  const mediaRaw = str(form, 'media_urls');
  const mediaUrls = mediaRaw ? mediaRaw.split('\n').map((s) => s.trim()).filter(Boolean) : [];
  const status = str(form, 'status') ?? 'idea';
  const payload = {
    talent_id: str(form, 'talent_id'),
    deal_id: str(form, 'deal_id'),
    platform: (str(form, 'platform') ?? 'instagram').toLowerCase(),
    caption: str(form, 'caption'),
    scheduled_for: str(form, 'scheduled_for'),
    // Precise publish instant (UTC ISO, computed client-side in the creator's tz).
    // The cron auto-publishes any 'scheduled' post once scheduled_at has passed.
    scheduled_at: str(form, 'scheduled_at'),
    status,
    media_urls: mediaUrls,
    // Rescheduling clears a prior failure so the cron gives it a fresh set of tries.
    ...(status === 'scheduled' ? { publish_error: null, publish_attempts: 0 } : {}),
  };
  if (id) await supabase.from('content_posts').update(payload).eq('id', id);
  else await supabase.from('content_posts').insert(payload);
  revalidatePath('/portal/content');
}

// A creator edits their own profile — routed through update_my_profile (SECURITY
// DEFINER, column-whitelisted to their own row), so publishing/slug/notes stay
// staff-only no matter what's posted.
export async function updateMyProfile(form: FormData) {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('update_my_profile', {
    p_name: str(form, 'name') ?? '',
    p_category: str(form, 'category') ?? '',
    p_location: str(form, 'location') ?? '',
    p_bio: str(form, 'bio') ?? '',
    p_headshot_url: str(form, 'headshot_url') ?? '',
  });
  if (error) {
    console.error('updateMyProfile', error.message);
    redirect('/portal/profile?saved=error');
  }
  revalidatePath('/portal/profile');
  revalidatePath('/portal');
  redirect('/portal/profile?saved=1');
}

// Draft an Instagram caption with AI for the content planner. Returns the text
// to the client (not a form action) so the editor can drop it into the textarea.
// RLS confines the deal lookup to the caller's own deals.
export async function draftCaption(input: {
  talentId: string;
  mediaUrl: string | null;
  isVideo: boolean;
  dealId: string | null;
}): Promise<{ ok: true; caption: string } | { ok: false; error: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Please sign in.' };

  const { data: talent } = await supabase
    .from('talent')
    .select('id')
    .eq('id', input.talentId)
    .maybeSingle();
  if (!talent) return { ok: false, error: 'Your creator profile isn’t linked.' };

  let brand: string | null = null;
  if (input.dealId) {
    const { data: deal } = await supabase
      .from('deals')
      .select('company:company_id(name)')
      .eq('id', input.dealId)
      .maybeSingle();
    const c = (deal as { company: { name: string } | { name: string }[] | null } | null)?.company;
    brand = (Array.isArray(c) ? c[0]?.name : c?.name) ?? null;
  }

  return draftInstagramCaption({ imageUrl: input.mediaUrl, isVideo: input.isVideo, brand });
}

export async function deleteContentPost(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (id) await supabase.from('content_posts').delete().eq('id', id);
  revalidatePath('/portal/content');
}

export async function deleteContentMedia(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (id) await supabase.from('content_media').delete().eq('id', id);
  revalidatePath('/portal/content');
}

// Publishes a planned post now (the manual "Publish" button), then redirects back
// with a status. The query key is per-platform (?ig= or ?tt=). Shares
// publishPostById with the scheduler.
export async function publishContentPost(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (!id) redirect('/portal/content');

  const { data: postRow } = await supabase
    .from('content_posts')
    .select('platform')
    .eq('id', id)
    .maybeSingle();
  const key = (postRow as { platform?: string } | null)?.platform === 'tiktok' ? 'tt' : 'ig';

  const outcome = await publishPostById(supabase, id);
  if (outcome.ok) {
    revalidatePath('/portal/content');
    redirect(`/portal/content?${key}=published`);
  }

  const map: Record<string, string> = {
    no_post: 'error',
    no_media: 'no_media',
    not_connected: 'not_connected',
    processing: 'processing',
    unsupported: 'publish_failed',
    failed: 'publish_failed',
  };
  redirect(`/portal/content?${key}=${map[outcome.reason] ?? 'publish_failed'}`);
}

// ---- Deals + budget -----------------------------------------------------
export async function saveDeal(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  const ch = str(form, 'channel');
  const payload = {
    company_id: str(form, 'company_id'),
    talent_id: str(form, 'talent_id'),
    booking_date: str(form, 'booking_date'),
    status: (str(form, 'status') ?? 'pitched') as DealStatus,
    live_url: str(form, 'live_url'),
    notes: str(form, 'notes'),
    channel: ch === 'inbound' || ch === 'outbound' ? ch : null,
    source: str(form, 'source'),
  };

  let dealId = id;
  if (id) {
    await supabase.from('deals').update(payload).eq('id', id);
  } else {
    const { data } = await supabase.from('deals').insert(payload).select('id').single();
    dealId = (data as { id: string } | null)?.id ?? null;
  }

  // Budget writes go to deal_budgets — only attempted for owner/admin; RLS would
  // reject a member anyway. Empty budget clears any existing row.
  if (dealId && (await isOwner())) {
    const budget = num(form, 'budget');
    if (budget === null) {
      await supabase.from('deal_budgets').delete().eq('deal_id', dealId);
    } else {
      await supabase
        .from('deal_budgets')
        .upsert({ deal_id: dealId, budget }, { onConflict: 'deal_id' });
    }
  }

  // Auto-sync this booking into the acting user's Google Calendar. Best-effort:
  // no-ops when Google isn't connected and never blocks the save.
  if (dealId) {
    const [{ data: company }, { data: talent }] = await Promise.all([
      payload.company_id
        ? supabase.from('companies').select('name').eq('id', payload.company_id).maybeSingle()
        : Promise.resolve({ data: null }),
      payload.talent_id
        ? supabase.from('talent').select('name').eq('id', payload.talent_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    await syncDealToCalendar({
      dealId,
      brandName: (company as { name: string } | null)?.name ?? 'Company',
      talentName: (talent as { name: string } | null)?.name ?? 'Talent',
      bookingDate: payload.booking_date,
      status: payload.status,
      notes: payload.notes,
      liveUrl: payload.live_url,
    });
  }

  revalidatePath('/crm/deals');
  redirect('/crm/deals');
}

// Pull a creator's Instagram stats into their media kit. Tier 1 (followers,
// recent posts, engagement) comes from Business Discovery via a connected
// professional account's token. Tier 2 (reach, audience demographics) is fetched
// only when the creator has connected their OWN IG — and only returns data once
// instagram_business_manage_insights is approved. Callable by staff (any talent)
// or a creator (their own); RLS enforces which rows they can write.
export async function pullInstagramStats(form: FormData) {
  const id = str(form, 'talent_id');
  const returnTo = str(form, 'return_to') ?? '/portal';
  const back = (q: string) => redirect(`${returnTo}?ig=${q}`);
  if (!id) back('no_talent');

  const supabase = await createServerSupabase();

  // The creator's own Facebook-login IG connection (if any) → insights + self lookup.
  const own = await getInstagramGraphConnection(id!);

  const { data: existing } = await supabase
    .from('instagram_stats')
    .select('username')
    .eq('talent_id', id)
    .maybeSingle();

  const handle =
    str(form, 'ig_handle') ??
    own?.ig_username ??
    (existing as { username: string | null } | null)?.username ??
    null;
  if (!handle) back('no_handle');

  // Token for Business Discovery: the creator's own connection, else the agency's.
  const disc = own
    ? { igBusinessId: own.ig_business_id, token: own.page_token }
    : await getInstagramGraphDiscovery();
  if (!disc) back('no_token');

  const profile = await fetchProfileGraph(disc!.igBusinessId, disc!.token, handle!);
  if (!profile || profile.followers == null) back('not_found');

  // Tier 2 insights — only when the creator connected their own IG (Facebook login).
  const insights = own ? await fetchInsightsGraph(own.ig_business_id, own.page_token) : null;
  const hasInsights = Boolean(
    insights &&
      (insights.reach != null ||
        insights.audienceGender ||
        insights.audienceAge ||
        insights.audienceCountry),
  );

  const { error } = await supabase.from('instagram_stats').upsert(
    {
      talent_id: id,
      username: profile!.username ?? handle,
      followers: profile!.followers,
      media_count: profile!.mediaCount,
      engagement_rate: profile!.engagementRate,
      avg_post_likes: profile!.avgPostLikes,
      avg_post_comments: profile!.avgPostComments,
      recent_posts: profile!.recentPosts,
      reach: insights?.reach ?? null,
      audience_gender: insights?.audienceGender ?? null,
      audience_age: insights?.audienceAge ?? null,
      audience_country: insights?.audienceCountry ?? null,
      has_insights: hasInsights,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'talent_id' },
  );
  if (error) back('save_failed');

  // Mirror the follower count into audience_stats so the existing Total reach
  // and roster figures pick it up.
  const { data: t } = await supabase
    .from('talent')
    .select('audience_stats, slug')
    .eq('id', id)
    .maybeSingle();
  const tal = t as { audience_stats: Record<string, number> | null; slug: string | null } | null;
  await supabase
    .from('talent')
    .update({ audience_stats: { ...(tal?.audience_stats ?? {}), instagram: profile!.followers } })
    .eq('id', id);

  revalidatePath('/portal');
  revalidatePath(`/crm/talent/${id}/edit`);
  revalidatePath('/roster');
  if (tal?.slug) revalidatePath(`/talent/${tal.slug}`);
  back('ok');
}

export async function deleteDeal(form: FormData) {
  const supabase = await createServerSupabase();
  const id = str(form, 'id');
  if (id) {
    await removeDealFromCalendar(id);
    await supabase.from('deals').delete().eq('id', id);
  }
  revalidatePath('/crm/deals');
  redirect('/crm/deals');
}

// Bill a deal through I AM CFO: creates the brand invoice + talent payout bill in
// QuickBooks (I AM CFO owns the QBO connection) and stores the returned ids on
// the deal. Owner/admin only — it writes real financial records. Redirects back
// to the deal with a ?billing=<status> flag the page surfaces.
export async function createDealBilling(form: FormData) {
  const id = str(form, 'id');
  if (!id) redirect('/crm/deals');

  const done = (status: string) => redirect(`/crm/deals/${id}?billing=${status}`);

  if (!(await isOwner())) done('not_owner');

  const supabase = await createServerSupabase();
  const { data: deal } = await supabase
    .from('deals')
    .select('id, company_id, talent_id, qbo_invoice_id')
    .eq('id', id)
    .maybeSingle();
  const row = deal as
    | { id: string; company_id: string | null; talent_id: string | null; qbo_invoice_id: string | null }
    | null;
  if (!row) done('error');

  // Already billed → don't create a second invoice.
  if (row!.qbo_invoice_id) done('exists');

  const [{ data: company }, { data: talent }, { data: bud }] = await Promise.all([
    row!.company_id
      ? supabase.from('companies').select('name').eq('id', row!.company_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row!.talent_id
      ? supabase.from('talent').select('name, payout_pct').eq('id', row!.talent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('deal_budgets').select('budget').eq('deal_id', id).maybeSingle(),
  ]);

  const brandName = (company as { name: string } | null)?.name ?? null;
  const talentRow = talent as { name: string; payout_pct: number | null } | null;
  const talentName = talentRow?.name ?? null;
  // Amount from the Billing card's field; fall back to the deal's budget.
  const amount = num(form, 'amount') ?? Number((bud as { budget: number | null } | null)?.budget ?? 0);

  if (!brandName) done('no_brand');
  if (!amount || amount <= 0) done('no_amount');

  // Payout split: a per-deal override ("90%" or "$1500") wins for one-off deals;
  // else the talent's default rate; else nothing (I AM CFO uses its own default).
  // The override is passed as a raw string — I AM CFO parses % vs $.
  const override = str(form, 'payout_override');
  const pct = talentRow?.payout_pct;
  const talentComp: BillingRequest['talentComp'] = override
    ? override
    : pct != null && Number.isFinite(Number(pct))
      ? { type: 'percent', value: Number(pct) / 100 }
      : undefined;

  const result = await createIamcfoBilling({
    dealId: id,
    customer: brandName!,
    amount,
    talent: talentName ?? undefined,
    talentComp,
    invoiceDate: str(form, 'invoice_date') ?? undefined,
    qboClass: str(form, 'qbo_class') ?? undefined,
    // Checkbox: "Also create talent payout bill" (checked by default). Absent =
    // unchecked = invoice-only one-off.
    skipBill: !form.get('create_bill'),
    // Explicit QBO Customer/Vendor picked from the synced dropdowns; blank means
    // create-or-match by the brand/talent name.
    customerId: str(form, 'customer_id') ?? undefined,
    vendorId: str(form, 'vendor_id') ?? undefined,
    description: talentName ? `${brandName} × ${talentName}` : brandName!,
  });

  if (!result) done('not_configured');

  if (result!.status === 'created' || result!.status === 'duplicate') {
    await supabase
      .from('deals')
      .update({
        qbo_invoice_id: result!.invoiceId ?? null,
        qbo_bill_id: result!.billId ?? null,
        invoice_number: result!.invoiceNumber ?? null,
      })
      .eq('id', id);
    revalidatePath(`/crm/deals/${id}`);
    revalidatePath('/crm/deals');
    done(result!.status === 'duplicate' ? 'exists' : 'created');
  }

  done(result!.status || 'error');
}

// Send an email to a lead via the logged-in user's Gmail. Redirects back to the
// lead with a ?sent / ?error flag the page surfaces.
export async function sendLeadEmail(form: FormData) {
  const leadId = str(form, 'lead_id');
  const to = str(form, 'to');
  const subject = str(form, 'subject') ?? '(no subject)';
  const body = str(form, 'body') ?? '';

  if (!leadId || !to) redirect('/crm/leads');

  const result = await sendGmail({ to, subject, body });
  revalidatePath(`/crm/leads/${leadId}`);
  if (result.ok) {
    redirect(`/crm/leads/${leadId}?sent=1`);
  }
  redirect(`/crm/leads/${leadId}?error=${encodeURIComponent(result.error ?? 'Send failed')}`);
}

// Owner links a creator's login to their talent record (by the creator's
// account email) so they get portal access. Redirects back with a ?link= status.
export async function linkTalentAccount(form: FormData) {
  const talentId = str(form, 'talent_id');
  const email = str(form, 'email');
  if (!talentId) redirect('/crm/talent');
  if (!email) redirect(`/crm/talent/${talentId}?link=no_email`);
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc('link_talent_account', {
    p_talent_id: talentId,
    p_email: email,
  });
  revalidatePath(`/crm/talent/${talentId}`);
  redirect(`/crm/talent/${talentId}?link=${(data as string) ?? 'error'}`);
}

// Owner invites a creator to their portal: records a pending invite and emails
// them a link to sign in (Google or email). On their first sign-in a DB trigger
// auto-links them to this talent row — no manual "grant access" needed.
export async function inviteTalent(form: FormData) {
  const talentId = str(form, 'talent_id');
  const email = str(form, 'email');
  if (!talentId) redirect('/crm/talent');
  if (!email) redirect(`/crm/talent/${talentId}?link=no_email`);
  if (!(await isOwner())) redirect(`/crm/talent/${talentId}?link=not_owner`);

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('talent_invites')
    .upsert({ email, talent_id: talentId, invited_by: user?.id ?? null }, { onConflict: 'email' });
  if (error) {
    redirect(`/crm/talent/${talentId}?link=invite_failed`);
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.CANONICAL_HOST ? `https://${process.env.CANONICAL_HOST}` : 'https://tulipstalent.co');
  const loginUrl = `${base.replace(/\/$/, '')}/login`;

  const talentRow = await supabase.from('talent').select('name').eq('id', talentId).maybeSingle();
  const firstName = ((talentRow.data as { name?: string } | null)?.name ?? 'there').split(' ')[0];

  const sent = await sendGmail({
    to: email,
    subject: 'Your Tulips Talent creator portal 🌷',
    body: [
      `Hi ${firstName},`,
      '',
      'You’ve been invited to your Tulips Talent creator portal — your home for your',
      'brand deals, earnings, payment status, and all your social accounts in one place.',
      '',
      `Sign in here (use “Continue with Google” or your email):`,
      loginUrl,
      '',
      'Once you sign in, your portal will be ready automatically.',
      '',
      '— Tulips Talent',
    ].join('\n'),
  });

  redirect(`/crm/talent/${talentId}?link=${sent.ok ? 'invited' : 'invite_email_failed'}`);
}

// Delete an Zordon draft from the Drafts review page. Owner/admin only (RLS
// blocks anyone else; nothing here sends).
export async function deleteAssistantDraft(form: FormData) {
  const id = str(form, 'id');
  if (!id) redirect('/crm/assistant/drafts');
  const supabase = await createServerSupabase();
  await supabase.from('assistant_drafts').delete().eq('id', id);
  revalidatePath('/crm/assistant/drafts');
  redirect('/crm/assistant/drafts');
}

// Delete a memory Zordon is holding. Owner/admin only (RLS).
export async function deleteAssistantMemory(form: FormData) {
  const id = str(form, 'id');
  if (!id) redirect('/crm/assistant/memory');
  const supabase = await createServerSupabase();
  await supabase.from('assistant_memory').delete().eq('id', id);
  revalidatePath('/crm/assistant/memory');
  redirect('/crm/assistant/memory');
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
