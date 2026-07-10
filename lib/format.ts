import type { AudienceStats } from './types';

/** 482000 -> "482K", 1500000 -> "1.5M" */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** Total reach across all platforms in audience_stats. */
export function totalReach(stats: AudienceStats): number {
  return Object.values(stats).reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

export function platformEntries(stats: AudienceStats): Array<{ platform: string; count: number }> {
  return Object.entries(stats)
    .filter(([, v]) => typeof v === 'number')
    .map(([platform, count]) => ({ platform, count: count as number }))
    .sort((a, b) => b.count - a.count);
}
