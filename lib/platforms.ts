// Shared social-platform metadata used by the creator portal (account manager)
// and the public media kit.

export interface PlatformMeta {
  value: string;
  label: string;
  icon: string;
  /** Platforms we can pull live stats for (Wave 2). */
  syncable?: boolean;
}

export const PLATFORMS: PlatformMeta[] = [
  { value: 'instagram', label: 'Instagram', icon: '📸' },
  { value: 'tiktok', label: 'TikTok', icon: '🎵' },
  { value: 'youtube', label: 'YouTube', icon: '▶️', syncable: true },
  { value: 'x', label: 'X / Twitter', icon: '𝕏' },
  { value: 'facebook', label: 'Facebook', icon: '📘' },
  { value: 'snapchat', label: 'Snapchat', icon: '👻' },
  { value: 'pinterest', label: 'Pinterest', icon: '📌' },
  { value: 'twitch', label: 'Twitch', icon: '🎮' },
  { value: 'website', label: 'Website', icon: '🌐' },
  { value: 'other', label: 'Other', icon: '🔗' },
];

export const platformIcon = (p: string): string =>
  PLATFORMS.find((x) => x.value === p)?.icon ?? '🔗';

export const platformLabel = (p: string): string =>
  PLATFORMS.find((x) => x.value === p)?.label ?? p;

export const isSyncable = (p: string): boolean =>
  PLATFORMS.find((x) => x.value === p)?.syncable ?? false;
